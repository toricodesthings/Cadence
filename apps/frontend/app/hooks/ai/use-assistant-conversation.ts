import { newRowId } from "../../lib/api/optimistic-id";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { getToolName, lastAssistantMessageIsCompleteWithApprovalResponses, type ChatStatus, type UIMessage } from "ai";
import {
    CONVERSATION_TITLE_DATA_TYPE,
    type ConversationTitleData,
    type ConversationListItem,
    type ConversationDetail,
} from "@cadence/contracts/ai";
import { deriveFallbackTitle } from "@cadence/domain/ai-title";
import { useAssistantStore } from "../../stores/assistant-store";
import { useConversationMessages } from "./use-conversations";
import { useConversationBroadcast, type ChatBroadcastType } from "./use-conversation-broadcast";
import { useApiClient } from "../auth/use-api-client";
import { useSettings } from "../core/use-settings";
import type { ReadyAttachment } from "./use-chat-attachments";
import { TOOL_CATALOG, isToolName } from "@cadence/contracts/ai-tools";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import { makeChatTransport } from "../../lib/ai/chat-transport";
import { firstOpenFor, liveChat, liveChatHandlers } from "../../lib/ai/live-chat";
import { checkMessageText } from "../../lib/ai/input-guard";
import { parseStreamErrorText, streamErrorFromError, type StreamError } from "../../lib/ai/stream-error";
import { imageIdsOf, imageFilePart, fileRefsOf, isAssistantToolPart, lastMessageIndex } from "../../lib/ai/messages";
import { authenticatedFetch } from "../../lib/api/client";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { stopServerStream } from "../../lib/ai/stop-stream";
import { log } from "../../lib/log";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";

type ConversationSnapshot = {
    conversation: Pick<ConversationDetail, "id" | "title" | "model" | "lastMessageAt" | "archived">;
    messages: UIMessage[];
};

type TurnTiming = { t0: number; skipParts: number; headersMs?: number; ttftMs?: number; firstTextMs?: number };

const ms = (value?: number) => (value === undefined ? "–" : `${value}ms`);

function stampFirstTokens(turn: TurnTiming, parts: UIMessage["parts"], since: number) {
    for (const part of parts) {
        if ((part.type !== "reasoning" && part.type !== "text") || !part.text) continue;
        turn.ttftMs ??= since;
        if (part.type === "text") turn.firstTextMs ??= since;
    }
}

function trackTurnTiming(
    current: TurnTiming | null,
    status: ChatStatus,
    last: UIMessage | undefined,
): TurnTiming | null {
    const fromAssistant = last?.role === "assistant" ? last.parts : [];
    const turn =
        current ?? (status === "submitted" ? { t0: performance.now(), skipParts: fromAssistant.length } : null);
    if (!turn) return null;
    const parts = fromAssistant.slice(turn.skipParts);
    const since = Math.round(performance.now() - turn.t0);
    stampFirstTokens(turn, parts, since);
    if (status !== "ready" && status !== "error") return turn;
    const toolCalls = parts.filter(isAssistantToolPart).length;
    log.debug(
        "ai-turn",
        `${status} · headers ${ms(turn.headersMs)} · ttft ${ms(turn.ttftMs)} · first text ${ms(turn.firstTextMs)} · total ${since}ms · ${toolCalls} tool calls`,
    );
    return null;
}

export function useAssistantConversation({
    online,
    onNotice,
    clearAttachments,
    onTurnSubmitted,
    open: embeddedOpen,
}: {
    online: boolean;
    open?: boolean;
    onNotice: (notice: string | null) => void;
    clearAttachments: (discard: boolean) => void;
    onTurnSubmitted: () => void;
}) {
    const {
        assistantPanelOpen: panelOpen,
        activeConversationId,
        startNewConversation,
        setActiveConversation,
        surface,
    } = useAssistantStore();
    const assistantPanelOpen = embeddedOpen ?? panelOpen;
    const queryClient = useQueryClient();
    const client = useApiClient();
    const resumeLastChat = useSettings().data?.assistant?.resumeLastChat !== false;
    const [isFreshThread, setIsFreshThread] = useState(false);
    const [threadTitle, setThreadTitle] = useState<string | null>(null);
    useEffect(() => {
        if (assistantPanelOpen && !activeConversationId) {
            startNewConversation();
            setIsFreshThread(true);
        }
    }, [assistantPanelOpen, activeConversationId, startNewConversation]);

    const turnTimingRef = useRef<TurnTiming | null>(null);

    const refreshedWritesRef = useRef(new Set<string>());
    const refreshAfterWrites = useCallback(
        (message: UIMessage) => {
            const landed = message.parts.flatMap((part) => {
                if (!isAssistantToolPart(part)) return [];
                const name = getToolName(part);
                const { state, toolCallId } = part;
                const kind = isToolName(name) ? TOOL_CATALOG[name].kind : undefined;
                const isWrite = !!kind && kind !== "read" && kind !== "ask" && state === "output-available";
                return isWrite && toolCallId && !refreshedWritesRef.current.has(toolCallId) ? [toolCallId] : [];
            });
            if (landed.length === 0) return;
            landed.forEach((id) => refreshedWritesRef.current.add(id));
            void hardRefreshWorkspaceCaches(queryClient);
        },
        [queryClient],
    );

    const aiFetch = useMemo(
        () =>
            ((req: RequestInfo | URL, init?: RequestInit) =>
                authenticatedFetch(req, { ...init, authenticated: true }).then((res) => {
                    const turn = turnTimingRef.current;
                    if (turn) turn.headersMs ??= Math.round(performance.now() - turn.t0);
                    return res;
                })) as typeof globalThis.fetch,
        [],
    );

    const conversationIdRef = useRef<string | null>(activeConversationId);
    conversationIdRef.current = activeConversationId;
    const clientMessageIdRef = useRef<string>(crypto.randomUUID());

    const transport = useMemo(
        () =>
            makeChatTransport(
                () => conversationIdRef.current ?? newRowId(),
                () => clientMessageIdRef.current,
                aiFetch,
            ),
        [aiFetch],
    );

    const handleTitleDataRef = useRef<(data: ConversationTitleData) => void>(() => {});

    liveChatHandlers.current = {
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onFinish: ({ message, messages: finished, isAbort }) => {
            refreshAfterWrites(message);
            if (isAbort) return;
            const convId = conversationIdRef.current;
            if (convId) syncMessagesToCache(convId, finished);
            const store = useAssistantStore.getState();
            if (document.hidden || (!store.assistantPanelOpen && !store.surface)) store.setReplyUnread(true);
        },
        onData: (part) => {
            if (part.type === CONVERSATION_TITLE_DATA_TYPE) {
                handleTitleDataRef.current(part.data as ConversationTitleData);
            }
        },
    };
    const {
        messages,
        sendMessage,
        regenerate,
        setMessages,
        addToolApprovalResponse,
        status,
        stop,
        error,
        resumeStream,
    } = useChat({ chat: liveChat(queryClient, activeConversationId ?? "none") });

    const isStreaming = status === "submitted" || status === "streaming";

    useEffect(() => {
        const last = messages.at(-1);
        if (status === "streaming" && last?.role === "assistant") refreshAfterWrites(last);
    }, [status, messages, refreshAfterWrites]);

    useEffect(() => {
        if (import.meta.env.DEV)
            turnTimingRef.current = trackTurnTiming(turnTimingRef.current, status, messages.at(-1));
    }, [status, messages]);

    const activeStreamIdRef = useRef<string | null>(null);

    const statusRef = useRef(status);
    statusRef.current = status;
    const localTurnRef = useRef(false);
    const skipResumeOnNextLoadRef = useRef(false);
    const retriedRef = useRef(false);

    const applyTitle = useCallback(
        (convId: string, title: string) => {
            if (!title) return;
            if (convId === conversationIdRef.current) setThreadTitle(title);
            queryClient.setQueryData<ConversationListItem[]>(queryKeys.ai.conversations, (prev) =>
                prev?.map((c) => (c.id === convId ? { ...c, title } : c)),
            );
            queryClient.setQueryData<ConversationSnapshot>(queryKeys.ai.conversation(convId), (prev) => {
                if (!prev) return prev;
                return { ...prev, conversation: { ...prev.conversation, title } };
            });
        },
        [queryClient],
    );

    const handleRemoteActivity = useCallback(
        (type: ChatBroadcastType, convId: string, title?: string) => {
            if (type === "title-updated") {
                if (title) applyTitle(convId, title);
                return;
            }
            if (convId !== conversationIdRef.current) return;
            if (statusRef.current === "submitted" || statusRef.current === "streaming") return;
            loadedThreadRef.current = null;
            skipResumeOnNextLoadRef.current = true;
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(convId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        },
        [queryClient, applyTitle],
    );
    const broadcastChatActivity = useConversationBroadcast(handleRemoteActivity);

    handleTitleDataRef.current = (data: ConversationTitleData) => {
        applyTitle(data.conversationId, data.title);
        broadcastChatActivity("title-updated", data.conversationId, data.title);
    };

    const sendLocal = useCallback(
        (message: Parameters<typeof sendMessage>[0], options?: Parameters<typeof sendMessage>[1]) => {
            localTurnRef.current = true;
            sendMessage(message, options);
        },
        [sendMessage],
    );
    const answerApproval = useCallback(
        (id: string, approved: boolean, reason?: string) => {
            localTurnRef.current = true;
            void addToolApprovalResponse({ id, approved, reason });
        },
        [addToolApprovalResponse],
    );
    const regenerateLocal = useCallback(
        (options?: Parameters<typeof regenerate>[0]) => {
            localTurnRef.current = true;
            regenerate(options);
        },
        [regenerate],
    );

    const {
        data: history,
        error: historyError,
        isFetching: historyFetching,
        isLoading: historyLoading,
    } = useConversationMessages(assistantPanelOpen && !isFreshThread ? activeConversationId : null);
    useEffect(() => {
        if ((historyError as { status?: number } | null)?.status !== 404) return;
        startNewConversation();
        setIsFreshThread(true);
    }, [historyError, startNewConversation]);
    const loadedThreadRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeConversationId) return;
        if (loadedThreadRef.current === activeConversationId) return;
        if (isFreshThread) {
            loadedThreadRef.current = activeConversationId;
            return;
        }
        if (history?.messages) {
            if (statusRef.current === "submitted" || statusRef.current === "streaming") return;
            setMessages(history.messages as UIMessage[]);
            setThreadTitle(history.conversation?.title ?? null);
            if (historyFetching) return;
            loadedThreadRef.current = activeConversationId;
            const skipResume = skipResumeOnNextLoadRef.current;
            skipResumeOnNextLoadRef.current = false;
            if (!skipResume && history.conversation?.activeStreamId) void resumeStream();
        }
    }, [activeConversationId, history, historyFetching, isFreshThread, setMessages, resumeStream]);

    useEffect(() => {
        activeStreamIdRef.current = history?.conversation?.activeStreamId ?? null;
    }, [history]);

    const prevOnlineRef = useRef(online);
    useEffect(() => {
        const cameBackOnline = !prevOnlineRef.current && online;
        prevOnlineRef.current = online;
        if (!cameBackOnline) return;
        if (isFreshThread || !activeConversationId) return;
        if (status === "streaming" || status === "submitted") return;
        loadedThreadRef.current = null;
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(activeConversationId) });
    }, [online, isFreshThread, activeConversationId, status, queryClient]);

    const syncMessagesToCache = useCallback(
        (convId: string, msgs: UIMessage[]) => {
            if (!convId || msgs.length === 0) return;
            queryClient.setQueryData<ConversationSnapshot>(queryKeys.ai.conversation(convId), (prev) => {
                return {
                    conversation: prev?.conversation ?? {
                        id: convId,
                        title: null,
                        model: null,
                        lastMessageAt: null,
                        archived: false,
                    },
                    messages: msgs,
                };
            });
        },
        [queryClient],
    );

    useEffect(() => {
        if (status === "submitted" || status === "streaming") return;
        const id = conversationIdRef.current;
        if (id && loadedThreadRef.current === id) syncMessagesToCache(id, messages);
    }, [status, messages, syncMessagesToCache]);

    const prevStatusRef = useRef(status);
    useEffect(() => {
        const prev = prevStatusRef.current;
        prevStatusRef.current = status;
        const convId = conversationIdRef.current;
        if (prev === "streaming" && status === "ready") {
            setIsFreshThread(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        }
        if (!localTurnRef.current || !convId) return;
        if (prev === "submitted" && status === "streaming") {
            broadcastChatActivity("stream-started", convId);
        }
        if (status === "ready" || status === "error") {
            localTurnRef.current = false;
            if (retriedRef.current) {
                retriedRef.current = false;
                loadedThreadRef.current = null;
                skipResumeOnNextLoadRef.current = true;
                queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(convId) });
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.usage });
            broadcastChatActivity("stream-finished", convId);
        }
    }, [status, queryClient, broadcastChatActivity]);

    const handleSelectConversation = useCallback(
        (id: string) => {
            const outgoing = conversationIdRef.current;
            if (outgoing && outgoing !== id) syncMessagesToCache(outgoing, messages);
            if (outgoing !== id) clearAttachments(true);
            loadedThreadRef.current = null;
            setIsFreshThread(false);
            setMessages([]);
            setThreadTitle(null);
            setActiveConversation(id);
        },
        [messages, syncMessagesToCache, setActiveConversation, setMessages, clearAttachments],
    );

    const handleNewChat = useCallback(() => {
        const outgoing = conversationIdRef.current;
        if (outgoing) syncMessagesToCache(outgoing, messages);
        clearAttachments(true);
        loadedThreadRef.current = null;
        clientMessageIdRef.current = crypto.randomUUID();
        setIsFreshThread(true);
        setMessages([]);
        setThreadTitle(null);
        startNewConversation();
    }, [messages, syncMessagesToCache, setMessages, startNewConversation, clearAttachments]);

    useLayoutEffect(() => {
        if (firstOpenFor(queryClient) && !resumeLastChat && activeConversationId) handleNewChat();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on the panel's first open

    const restoring =
        messages.length === 0 && !isFreshThread && (historyLoading || (history?.messages.length ?? 0) > 0);

    const submitText = (raw: string, readyImages: readonly ReadyAttachment[], uploading: boolean): boolean => {
        const text = raw.trim();
        if ((!text && readyImages.length === 0) || isStreaming || uploading) return false;

        if (!online) {
            onNotice("You’re offline — I’ll be here when you’re back.");
            return false;
        }
        const guard = checkMessageText(text);
        if (!guard.ok) {
            onNotice(guard.reason ?? null);
            return false;
        }

        clientMessageIdRef.current = crypto.randomUUID();
        onNotice(null);
        const imageIds = [...new Set(readyImages.map((a) => a.imageId))];
        for (const a of readyImages) if (a.blob) queryClient.setQueryData(queryKeys.ai.image(a.imageId), a.blob);
        const convId = conversationIdRef.current;
        if (convId && isFreshThread && messages.length === 0) {
            applyTitle(
                convId,
                surface === "weekly_reset"
                    ? `Weekly Reset · ${formatShortDateLabel(today())}`
                    : deriveFallbackTitle(text, imageIds.length > 0),
            );
        }
        const files = [...new Map(readyImages.map((a) => [a.imageId, a])).values()].map((a) =>
            imageFilePart(a.imageId, a.mediaType),
        );
        sendLocal(text ? { text, files } : { files });
        clearAttachments(false);
        requestAnimationFrame(onTurnSubmitted);
        return true;
    };

    const handleStop = useCallback(async () => {
        const convId = conversationIdRef.current;
        if (convId) {
            try {
                await stopServerStream(convId, activeStreamIdRef.current, messages.at(-1));
            } catch {}
        }
        stop();
    }, [messages, stop]);

    const handleEdit = (index: number, nextText: string) => {
        if (isStreaming) void handleStop();
        clientMessageIdRef.current = crypto.randomUUID();
        const editAnchorId = index > 0 ? (messages[index - 1]?.id ?? null) : null;
        const files = fileRefsOf(messages[index]).map((f) => imageFilePart(f.id, f.mediaType));
        setMessages((prev) => prev.slice(0, index));
        sendLocal({ text: nextText, files }, { body: { editAnchorId } });
        requestAnimationFrame(onTurnSubmitted);
    };

    const handleRetry = useCallback(() => {
        if (!online) {
            onNotice("You’re offline — I’ll be here when you’re back.");
            return;
        }
        retriedRef.current = true;
        regenerateLocal();
        requestAnimationFrame(onTurnSubmitted);
    }, [online, regenerateLocal, onNotice, onTurnSubmitted]);

    const streamError: StreamError | null = useMemo(() => {
        if (!error) return null;
        const msg = error instanceof Error ? error.message : "";
        if (msg.trim().startsWith("{")) return parseStreamErrorText(msg);
        return streamErrorFromError(error);
    }, [error]);

    const replyToQuestion = (text: string) => {
        if (isStreaming) return;
        if (!online) {
            onNotice("You’re offline — I’ll be here when you’re back.");
            return;
        }
        clientMessageIdRef.current = crypto.randomUUID();
        sendLocal({ text });
        requestAnimationFrame(onTurnSubmitted);
    };
    const lastUserIndex = lastMessageIndex(messages, "user");
    const lastUserMessage = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
    const lastUserImages = useMemo(() => (lastUserMessage ? imageIdsOf(lastUserMessage) : []), [lastUserMessage]);
    const sendWithoutImages = () => {
        if (!lastUserMessage) return;
        const text = lastUserMessage.parts
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("\n")
            .trim();
        setMessages((prev) => prev.slice(0, lastUserIndex));
        if (!text) {
            onNotice("There were only photos or PDFs in that message.");
            return;
        }
        clientMessageIdRef.current = crypto.randomUUID();
        sendLocal({ text });
        requestAnimationFrame(onTurnSubmitted);
    };
    const shareImages = async () => {
        await Promise.all(
            lastUserImages.map(async (id) =>
                unwrapResponse(
                    await client.api.ai.images[":id"].report.$post({
                        param: { id },
                        json: { requestId: streamError?.requestId },
                    }),
                ),
            ),
        );
    };
    const imageError = streamError && lastUserImages.length > 0 ? streamError.code : null;

    return {
        messages,
        status,
        isStreaming,
        restoring,
        threadTitle,
        activeConversationId,
        submitText,
        handleNewChat,
        handleSelectConversation,
        handleStop,
        handleEdit,
        handleRetry,
        regenerateLocal,
        answerApproval,
        replyToQuestion,
        streamError,
        imageError,
        sendWithoutImages,
        shareImages,
    };
}

export type AssistantConversation = ReturnType<typeof useAssistantConversation>;
