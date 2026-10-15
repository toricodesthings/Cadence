import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { getToolName, lastAssistantMessageIsCompleteWithApprovalResponses, type ChatStatus, type UIMessage } from "ai";
import { CONVERSATION_TITLE_DATA_TYPE, type ConversationTitleData, type ConversationListItem, type ConversationDetail } from "@cadence/contracts/ai";
import { deriveFallbackTitle } from "@cadence/domain/ai-title";
import { useAssistantStore } from "../../stores/assistant-store";
import { useConversationMessages } from "./use-conversations";
import { useConversationBroadcast, type ChatBroadcastType } from "./use-conversation-broadcast";
import { useApiClient } from "../auth/use-api-client";
import type { ReadyAttachment } from "./use-chat-attachments";
import { TOOL_CATALOG, isToolName } from "@cadence/contracts/ai-tools";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import { makeChatTransport } from "../../lib/ai/chat-transport";
import { checkMessageText } from "../../lib/ai/input-guard";
import { parseStreamErrorText, streamErrorFromError, type StreamError } from "../../lib/ai/stream-error";
import { imageIdsOf, imageFilePart, isAssistantToolPart, lastMessageIndex } from "../../lib/ai/messages";
import { authenticatedFetch } from "../../lib/api/client";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { stopServerStream } from "../../lib/ai/stop-stream";
import { log } from "../../lib/log";

// Locally seeded snapshots have only the metadata known before the first server read.
type ConversationSnapshot = {
    conversation: Pick<ConversationDetail, "id" | "title" | "model" | "lastMessageAt" | "archived">;
    messages: UIMessage[];
};

// Dev timing skips already-streamed parts when an approval continues the same reply.
type TurnTiming = { t0: number; skipParts: number; headersMs?: number; ttftMs?: number; firstTextMs?: number };

const ms = (value?: number) => (value === undefined ? "–" : `${value}ms`);

function stampFirstTokens(turn: TurnTiming, parts: UIMessage["parts"], since: number) {
    for (const part of parts) {
        if ((part.type !== "reasoning" && part.type !== "text") || !part.text) continue;
        turn.ttftMs ??= since;
        if (part.type === "text") turn.firstTextMs ??= since;
    }
}

/** Dev only: stamps the turn's first-token times and logs it once it ends. Returns the turn still in flight. */
function trackTurnTiming(current: TurnTiming | null, status: ChatStatus, last: UIMessage | undefined): TurnTiming | null {
    const fromAssistant = last?.role === "assistant" ? last.parts : [];
    const turn = current ?? (status === "submitted" ? { t0: performance.now(), skipParts: fromAssistant.length } : null);
    if (!turn) return null;
    const parts = fromAssistant.slice(turn.skipParts);
    const since = Math.round(performance.now() - turn.t0);
    stampFirstTokens(turn, parts, since);
    if (status !== "ready" && status !== "error") return turn;
    const toolCalls = parts.filter(isAssistantToolPart).length;
    log.debug("ai-turn", `${status} · headers ${ms(turn.headersMs)} · ttft ${ms(turn.ttftMs)} · first text ${ms(turn.firstTextMs)} · total ${since}ms · ${toolCalls} tool calls`);
    return null;
}

/** Owns the active chat session and its persisted/cross-tab lifecycle. */
export function useAssistantConversation({ online, onNotice, clearAttachments, onTurnSubmitted }: {
    online: boolean;
    onNotice: (notice: string | null) => void;
    clearAttachments: (discard: boolean) => void;
    onTurnSubmitted: () => void;
}) {
    const { assistantPanelOpen, activeConversationId, startNewConversation, setActiveConversation } = useAssistantStore();
    const queryClient = useQueryClient();
    const client = useApiClient();
    const [isFreshThread, setIsFreshThread] = useState(false);
    const [threadTitle, setThreadTitle] = useState<string | null>(null);
    // Ensure a thread id exists before the first send. The store persists it, but
    // a brand-new install starts with `null` — mint one lazily on open.
    useEffect(() => {
        if (assistantPanelOpen && !activeConversationId) {
            startNewConversation();
            setIsFreshThread(true);
        }
    }, [assistantPanelOpen, activeConversationId, startNewConversation]);

    const turnTimingRef = useRef<TurnTiming | null>(null);

    // Writes run on the server mid-turn, so the workspace refreshes as each one lands
    // (and once more on finish for any the stream didn't show); each write refreshes once.
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
                })) as typeof fetch,
        [],
    );

    // Read thread and idempotency ids lazily so the transport stays stable across turns.
    const conversationIdRef = useRef<string | null>(activeConversationId);
    conversationIdRef.current = activeConversationId;
    const clientMessageIdRef = useRef<string>(crypto.randomUUID());

    const transport = useMemo(
        () =>
            makeChatTransport(
                () => conversationIdRef.current ?? crypto.randomUUID(),
                () => clientMessageIdRef.current,
                aiFetch,
            ),
        [aiFetch],
    );

    // Resume is manual: automatically attaching after our own turn would replay its reply.
    // The ref keeps transient title callbacks current without rebuilding the session.
    const handleTitleDataRef = useRef<(data: ConversationTitleData) => void>(() => {});

    const { messages, sendMessage, regenerate, setMessages, addToolApprovalResponse, status, stop, error, resumeStream } =
        useChat({
            transport,
            id: activeConversationId ?? undefined,
            resume: false,
            // Continue the same reply only once every approval has an answer.
            sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
            // Writes run on the server now, so a reply that changed anything refreshes the workspace.
            onFinish: ({ message }) => refreshAfterWrites(message),
            // Transient title data updates the header and sidebar.
            onData: (part) => {
                if (part.type === CONVERSATION_TITLE_DATA_TYPE) {
                    handleTitleDataRef.current(part.data as ConversationTitleData);
                }
            },
        });

    const isStreaming = status === "submitted" || status === "streaming";

    useEffect(() => {
        const last = messages.at(-1);
        if (status === "streaming" && last?.role === "assistant") refreshAfterWrites(last);
    }, [status, messages, refreshAfterWrites]);

    useEffect(() => {
        if (import.meta.env.DEV) turnTimingRef.current = trackTurnTiming(turnTimingRef.current, status, messages.at(-1));
    }, [status, messages]);

    // Stop includes the server stream id to avoid aborting a newer turn.
    const activeStreamIdRef = useRef<string | null>(null);

    // Current status, read by the cross-tab handler without a stale closure.
    const statusRef = useRef(status);
    statusRef.current = status;
    // Only locally originated turns broadcast; resumed turns must not echo across tabs.
    const localTurnRef = useRef(false);
    // Peer activity re-seeds history without resuming. Genuine loads/reconnects may resume.
    const skipResumeOnNextLoadRef = useRef(false);
    // A retry can continue a failed reply that already changed something (the server
    // keeps those steps). Only the new steps stream, so the thread re-seeds once it ends.
    const retriedRef = useRef(false);

    // Apply titles to the visible header and both caches without refetching or clearing a title.
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
            // A peer titled this thread — apply it (header + caches) regardless of which
            // thread we're viewing; never triggers the history re-seed dance below.
            if (type === "title-updated") {
                if (title) applyTitle(convId, title);
                return;
            }
            if (convId !== conversationIdRef.current) return; // not the visible thread
            if (statusRef.current === "submitted" || statusRef.current === "streaming") return; // we're the producer
            loadedThreadRef.current = null;
            skipResumeOnNextLoadRef.current = true; // re-seed only; do not re-attach
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(convId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        },
        [queryClient, applyTitle],
    );
    const broadcastChatActivity = useConversationBroadcast(handleRemoteActivity);

    // Wire the streamed-title handler now that applyTitle + broadcast exist: update
    // local caches/header, then announce to peer tabs so their sidebars update too.
    handleTitleDataRef.current = (data: ConversationTitleData) => {
        applyTitle(data.conversationId, data.title);
        broadcastChatActivity("title-updated", data.conversationId, data.title);
    };

    // Mark outgoing turns as local; resume never goes through these actions.
    const sendLocal = useCallback(
        (message: Parameters<typeof sendMessage>[0], options?: Parameters<typeof sendMessage>[1]) => {
            localTurnRef.current = true;
            sendMessage(message, options);
        },
        [sendMessage],
    );
    // Answering an approval sends the answers (once all are in) as a turn this tab owns.
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

    // Fresh client-minted threads have no server row to fetch yet.
    const { data: history, error: historyError, isFetching: historyFetching } = useConversationMessages(
        assistantPanelOpen && !isFreshThread ? activeConversationId : null,
    );
    // The persisted thread is gone server-side (deleted elsewhere, DB reset) — start fresh
    // instead of leaving the panel stuck on a 404.
    useEffect(() => {
        if ((historyError as { status?: number } | null)?.status !== 404) return;
        startNewConversation();
        setIsFreshThread(true);
    }, [historyError, startNewConversation]);
    const loadedThreadRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeConversationId) return;
        if (loadedThreadRef.current === activeConversationId) return;
        // A fresh (client-minted) thread has no server history to seed (and never a live
        // stream to re-attach to) — mark it loaded so we don't refetch / 404 it.
        if (isFreshThread) {
            loadedThreadRef.current = activeConversationId;
            return;
        }
        if (history?.messages) {
            // A turn started while the read was in flight owns the view now.
            if (statusRef.current === "submitted" || statusRef.current === "streaming") return;
            setMessages(history.messages as UIMessage[]);
            setThreadTitle(history.conversation?.title ?? null);
            // The cached snapshot shows at once, but it can predate a turn that ran while
            // the panel was closed: only the server's answer locks the thread in.
            if (historyFetching) return;
            loadedThreadRef.current = activeConversationId;
            // Only genuine loads of a live stream resume; finished replies and peer
            // activity arrive entirely through history, avoiding duplicate text.
            const skipResume = skipResumeOnNextLoadRef.current;
            skipResumeOnNextLoadRef.current = false;
            if (!skipResume && history.conversation?.activeStreamId) void resumeStream();
        }
    }, [activeConversationId, history, historyFetching, isFreshThread, setMessages, resumeStream]);

    // Hydrate the stream id from server history for guarded Stop requests.
    useEffect(() => {
        activeStreamIdRef.current = history?.conversation?.activeStreamId ?? null;
    }, [history]);

    // On reconnect, refetch history before resuming: the turn may have finished offline.
    const prevOnlineRef = useRef(online);
    useEffect(() => {
        const cameBackOnline = !prevOnlineRef.current && online;
        prevOnlineRef.current = online;
        if (!cameBackOnline) return;
        if (isFreshThread || !activeConversationId) return;
        if (status === "streaming" || status === "submitted") return; // already attached
        loadedThreadRef.current = null;
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(activeConversationId) });
    }, [online, isFreshThread, activeConversationId, status, queryClient]);

    // Cache settled messages so switching away and back retains the latest turns.
    const syncMessagesToCache = useCallback(
        (convId: string, msgs: UIMessage[]) => {
            if (!convId || msgs.length === 0) return;
            queryClient.setQueryData<ConversationSnapshot>(queryKeys.ai.conversation(convId), (prev) => {
                return {
                    conversation:
                        prev?.conversation ??
                        { id: convId, title: null, model: null, lastMessageAt: null, archived: false },
                    messages: msgs,
                };
            });
        },
        [queryClient],
    );

    useEffect(() => {
        if (status === "submitted" || status === "streaming") return; // don't thrash mid-stream
        const id = conversationIdRef.current;
        // Until the server's history lands, the view is the cache itself: writing it back would
        // only re-trigger the load.
        if (id && loadedThreadRef.current === id) syncMessagesToCache(id, messages);
    }, [status, messages, syncMessagesToCache]);

    const prevStatusRef = useRef(status);
    // A reply that lands unseen (panel closed, tab hidden) marks the assistant unread; one still
    // coming when the panel unmounts is handed to `useAssistantReplyWatcher`. Runs before the
    // effect below moves prevStatusRef on.
    useEffect(() => {
        if (status !== "ready" && status !== "error") return;
        if (prevStatusRef.current !== "streaming" && prevStatusRef.current !== "submitted") return;
        if (document.hidden || !useAssistantStore.getState().assistantPanelOpen) useAssistantStore.getState().setReplyUnread(true);
    }, [status]);
    useEffect(() => () => {
        const convId = conversationIdRef.current;
        if (convId && (statusRef.current === "submitted" || statusRef.current === "streaming")) {
            useAssistantStore.getState().setPendingReply(convId);
        }
    }, []);

    // On a completed streamed turn (streaming → ready), the thread now exists
    // server-side and its sidebar row (title/order) may have changed.
    useEffect(() => {
        const prev = prevStatusRef.current;
        prevStatusRef.current = status;
        const convId = conversationIdRef.current;
        if (prev === "streaming" && status === "ready") {
            setIsFreshThread(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        }
        // Resumed turns stay silent; only the producer announces activity.
        if (!localTurnRef.current || !convId) return;
        // Producer is live: idle peers can re-seed their history.
        if (prev === "submitted" && status === "streaming") {
            broadcastChatActivity("stream-started", convId);
        }
        // Producer reached a terminal state → idle tabs re-sync so the final message
        // shows even if they missed the live window (reliable guarantee, short turns).
        if (status === "ready" || status === "error") {
            localTurnRef.current = false;
            if (retriedRef.current) {
                retriedRef.current = false;
                loadedThreadRef.current = null;
                skipResumeOnNextLoadRef.current = true;
                queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(convId) });
            }
            // The turn spent budget — refresh the usage line with real numbers.
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.usage });
            broadcastChatActivity("stream-finished", convId);
        }
    }, [status, queryClient, broadcastChatActivity]);

    // Selecting a thread from history: persist the outgoing thread's live state,
    // then reset the loaded marker so the chosen thread's messages load fresh.
    const handleSelectConversation = useCallback(
        (id: string) => {
            const outgoing = conversationIdRef.current;
            if (outgoing && outgoing !== id) syncMessagesToCache(outgoing, messages);
            // Attached images belong to the thread they were attached in.
            if (outgoing !== id) clearAttachments(true);
            loadedThreadRef.current = null;
            setIsFreshThread(false);
            setMessages([]);
            setThreadTitle(null); // re-seeded from the chosen thread's history load
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

        // Fresh idempotency token for this user turn (reused verbatim on Retry).
        clientMessageIdRef.current = crypto.randomUUID();
        onNotice(null);
        // Optimistic instant title for a brand-new thread so the header/sidebar never
        // sit blank — replaced by the AI title when its data part streams back (~300ms).
        const imageIds = [...new Set(readyImages.map((a) => a.imageId))];
        // The bubble shows the bytes we already have instead of downloading them again.
        for (const a of readyImages) if (a.blob) queryClient.setQueryData(queryKeys.ai.image(a.imageId), a.blob);
        const convId = conversationIdRef.current;
        if (convId && isFreshThread && messages.length === 0) {
            applyTitle(convId, deriveFallbackTitle(text, imageIds.length > 0));
        }
        const files = imageIds.map(imageFilePart);
        sendLocal(text ? { text, files } : { files });
        clearAttachments(false);
        requestAnimationFrame(onTurnSubmitted);
        return true;
    };

    // Stop the server producer before local teardown; server failure must still stop the UI.
    const handleStop = useCallback(async () => {
        const convId = conversationIdRef.current;
        if (convId) {
            try {
                await stopServerStream(
                    convId,
                    activeStreamIdRef.current,
                    messages.at(-1),
                );
            } catch {
                // Best-effort: fall through to local teardown regardless.
            }
        }
        stop();
    }, [messages, stop]);

    // Edits get a new token and keep their photos. The server truncates after editAnchorId.
    const handleEdit = (index: number, nextText: string) => {
        if (isStreaming) void handleStop();
        clientMessageIdRef.current = crypto.randomUUID();
        const editAnchorId = index > 0 ? (messages[index - 1]?.id ?? null) : null;
        // The edited turn keeps its photos (already sent, so they cost nothing again).
        const files = imageIdsOf(messages[index]).map(imageFilePart);
        setMessages((prev) => prev.slice(0, index));
        sendLocal({ text: nextText, files }, { body: { editAnchorId } });
        requestAnimationFrame(onTurnSubmitted);
    };

    // Retry reuses the SAME clientMessageId so the server dedupes the user row.
    const handleRetry = useCallback(() => {
        if (!online) {
            onNotice("You’re offline — I’ll be here when you’re back.");
            return;
        }
        retriedRef.current = true;
        regenerateLocal();
        requestAnimationFrame(onTurnSubmitted);
    }, [online, regenerateLocal, onNotice, onTurnSubmitted]);

    // Normalize both pre-stream HTTP failures and typed JSON stream errors.
    const streamError: StreamError | null = useMemo(() => {
        if (!error) return null;
        const msg = error instanceof Error ? error.message : "";
        if (msg.trim().startsWith("{")) return parseStreamErrorText(msg);
        return streamErrorFromError(error);
    }, [error]);

    // An answer to the assistant's question (`ask_user`): a plain next message, leaving the composer's draft alone.
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
    // A failed turn with photos: send it again without them, or share them with the report.
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
            onNotice("There were only images in that message.");
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
        messages, status, isStreaming, threadTitle, activeConversationId,
        submitText, handleNewChat, handleSelectConversation, handleStop,
        handleEdit, handleRetry, regenerateLocal, answerApproval, replyToQuestion,
        streamError, imageError, sendWithoutImages, shareImages,
    };
}

export type AssistantConversation = ReturnType<typeof useAssistantConversation>;
