import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { X, ArrowUp, ArrowDown, History, SquarePen, Plus, Zap, ShieldCheck, ShieldOff, ChevronDown, Sunrise, AlarmClock, Inbox } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ResizableSidePanel } from "../shared/ResizableSidePanel";
import { Tip, DropdownMenu } from "../primitives";
import * as ScrollArea from "../primitives/ScrollArea";
import { useAssistantStore } from "../../stores/assistant-store";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { ChatMessage, ChatAvatar, AssistantText } from "./MessageBubble";
import { AssistantSigil } from "./AssistantSigil";
import { ReadReceipt, type ReceiptState } from "./ReadReceipt";
import { ConversationList } from "./ConversationList";
import { ChatErrorBubble } from "./ChatErrorBubble";
import { ToolActivityChip, type ToolCall } from "./ToolActivityChip";
import { ToolPart, isReadToolPart, safeToolName, getToolDescriptor } from "./tool-registry";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import { makeChatTransport } from "../../lib/ai/chat-transport";
import { checkMessageText } from "../../lib/ai/input-guard";
import {
    parseStreamErrorText,
    streamErrorFromError,
    type StreamError,
} from "../../lib/ai/stream-error";
import {
    useConversationMessages,
    type ConversationSummary,
    type ConversationDetail,
} from "../../hooks/ai/use-conversations";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useAiUsage } from "../../hooks/ai/use-ai-usage";
import { describeUsage } from "../../lib/ai/usage";
import { useSettings } from "../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { useConversationBroadcast, type ChatBroadcastType } from "../../hooks/ai/use-conversation-broadcast";
import { queryKeys } from "../../lib/api/query-keys";
import { authenticatedFetch } from "../../lib/api/client";
import { stopServerStream } from "../../lib/ai/stop-stream";
import { deriveFallbackTitle } from "@cadence/domain/ai-title";
import { CONVERSATION_TITLE_DATA_TYPE, type ConversationTitleData } from "@cadence/contracts/ai";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useOnlineStatus } from "../../hooks/core/use-online-status";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";

/** Three soft bouncing dots — the "assistant is typing…" affordance. */
function TypingDots({ name }: { name: string }) {
    return (
        <span className="flex items-center gap-1 py-0.5" aria-label={`${name} is typing`}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-twilight-text-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
                />
            ))}
        </span>
    );
}

/** One step of an assistant turn, in the order it happened. */
type Segment =
    | { kind: "text"; text: string }
    | { kind: "reads"; calls: ToolCall[]; pending: boolean }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | { kind: "card"; part: any };

/**
 * Walk a turn's parts in stream order: adjacent text runs merge into one card,
 * adjacent read tools into one activity chip, and proposal/write tools stand
 * alone. So a lookup that happened before the reply sits above it.
 */
function buildSegments(parts: UIMessage["parts"]): Segment[] {
    const out: Segment[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const part of parts as any[]) {
        const last = out.at(-1);
        if (part.type === "text") {
            if (!part.text) continue;
            if (last?.kind === "text") last.text += `\n\n${part.text}`;
            else out.push({ kind: "text", text: part.text });
        } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            if (!isReadToolPart(part)) {
                out.push({ kind: "card", part });
                continue;
            }
            const name = safeToolName(part);
            const label = (name && getToolDescriptor(name)?.label) || "Looked something up";
            const pending = part.state !== "output-available";
            const call: ToolCall = { label, tool: name ?? undefined, input: part.input, pending };
            if (last?.kind === "reads") {
                last.calls.push(call);
                last.pending ||= pending;
            } else {
                out.push({ kind: "reads", calls: [call], pending });
            }
        }
    }
    return out;
}

const STARTERS = [
    { prompt: "Plan my morning", icon: Sunrise },
    { prompt: "What’s overdue?", icon: AlarmClock },
    { prompt: "Tidy my inbox", icon: Inbox },
];

const MAX_ATTACHMENTS = 4;

const APPROVAL_MODES: Record<ApprovalMode, { label: string; icon: React.ReactNode; hint: (name: string) => string }> = {
    ask: { label: "Ask first", icon: <ShieldCheck size={13} aria-hidden />, hint: () => "Confirm every create, change or delete" },
    auto: { label: "Auto", icon: <Zap size={13} aria-hidden />, hint: (name) => `${name} applies changes, but asks before deleting for good` },
    full: { label: "Full", icon: <ShieldOff size={13} aria-hidden />, hint: (name) => `${name} applies every change, deletes included` },
};
type Attachment = { id: string; name: string; url: string };

/** The `status` metadata a persisted assistant turn may carry (§8.3). */
function messageStatus(message: UIMessage): string | undefined {
    const meta = (message as { metadata?: { status?: unknown } }).metadata;
    return typeof meta?.status === "string" ? meta.status : undefined;
}

export function AssistantSidePanel({
    width,
    onWidthChange,
    isMobile = false,
}: {
    width: number;
    onWidthChange?: (w: number) => void;
    isMobile?: boolean;
}) {
    const {
        toggleAssistantPanel,
        assistantPanelOpen,
        activeConversationId,
        historyOpen,
        setHistoryOpen,
        startNewConversation,
        setActiveConversation,
        approvalMode,
        setApprovalMode,
    } = useAssistantStore();
    const coarse = useIsCoarsePointer();
    const { session } = useAuthState();
    const userImage = session?.user?.image;
    const userInitial = (session?.user?.name || session?.user?.email || "U")[0]!.toUpperCase();
    const reduceMotion = useReducedMotion();
    const online = useOnlineStatus();
    const queryClient = useQueryClient();
    // The assistant's (renameable) name — the same identity the model speaks
    // with (settings.assistant.assistantName), so the panel chrome and the
    // model's self-reference never disagree.
    const { data: settings } = useSettings();
    const assistantName =
        settings?.assistant?.assistantName?.trim() || SETTINGS_DEFAULTS.assistant.assistantName;
    // Usage budget transparency — a calm "≈ N messages left" line appears in the
    // composer footer only when a window is running low (never a meter otherwise).
    const { data: usage } = useAiUsage(assistantPanelOpen);
    const usageNotice = useMemo(() => describeUsage(usage, Date.now()), [usage]);
    const [input, setInput] = useState("");
    const pendingMessage = useAssistantStore(s => s.pendingMessage);
    const clearPendingMessage = useAssistantStore(s => s.clearPendingMessage);
    useEffect(() => { if (pendingMessage) { setInput(pendingMessage); clearPendingMessage(); } }, [pendingMessage, clearPendingMessage]);
    const [inputNotice, setInputNotice] = useState<string | null>(null);
    // A brand-new (client-minted) thread has no server row yet — skip the
    // load-by-id fetch for it so we don't 404 before its first turn is sent.
    const [isFreshThread, setIsFreshThread] = useState(false);
    // The active thread's title, shown in the header. Set optimistically on the
    // first send (derived), then by the streamed `data-conversation-title` part,
    // and seeded from history when an existing thread loads.
    const [threadTitle, setThreadTitle] = useState<string | null>(null);
    const scrollViewportRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Whether the user is parked near the bottom of the thread. Auto-scroll only
    // follows the stream when true, so scrolling up to re-read history mid-stream
    // is never yanked back down.
    const isNearBottomRef = useRef(true);
    // Offer a jump back down once the reader has scrolled well up.
    const [showJump, setShowJump] = useState(false);
    // Composer-only image attachments (not sent yet — no backend wiring).
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Ensure a thread id exists before the first send. The store persists it, but
    // a brand-new install starts with `null` — mint one lazily on open.
    useEffect(() => {
        if (assistantPanelOpen && !activeConversationId) {
            startNewConversation();
            setIsFreshThread(true);
        }
    }, [assistantPanelOpen, activeConversationId, startNewConversation]);

    // ── Transport (load-by-id, Phase 1) ──────────────────────────────────────
    // Always attach the session JWT — DefaultChatTransport calls fetch without our
    // `authenticated` flag, so we wrap it to opt every chat request into auth.
    const aiFetch = useMemo(
        () =>
            ((req: RequestInfo | URL, init?: RequestInit) =>
                authenticatedFetch(req, { ...init, authenticated: true })) as typeof fetch,
        [],
    );

    // The conversation id + per-turn clientMessageId are read lazily by the
    // transport on every send (so swapping threads / minting a fresh idempotency
    // token never rebuilds the transport).
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

    // Scope the chat to the conversation id so the SDK's resume GET targets the
    // right thread: a manual resumeStream() issues `GET {api}/{id}/stream`, and the
    // transport `api` is `…/api/v1/ai/chat`, so the resume URL resolves to
    // `…/api/v1/ai/chat/:conversationId/stream` (doc Update 4 §7.8 / §8). The
    // backend 204s when nothing is live, so the non-resume path is unchanged.
    //
    // Resume is driven MANUALLY (see the load effect + online-restore), never by the
    // `resume` prop. The prop auto-calls resumeStream() on every false→true flip
    // (dist/index.js:257) — and `isFreshThread` flipping false after a local turn would
    // flip it true, making the producer re-attach to its OWN just-finished stream. The
    // SDK treats that (last message already the complete assistant) as a continuation and
    // re-streams the finished text onto itself → a doubled reply. Manual control = exactly
    // one resume, only when we actually want to re-attach to a stream we're not showing.
    // Title data parts arrive via onData; route them through a ref so the (stable)
    // handler always sees the latest applyTitle/broadcast without rebuilding useChat.
    const handleTitleDataRef = useRef<(data: ConversationTitleData) => void>(() => {});

    const { messages, sendMessage, regenerate, setMessages, addToolApprovalResponse, status, stop, error, resumeStream } =
        useChat({
            transport,
            id: activeConversationId ?? undefined,
            resume: false,
            // Once every approval on the reply is answered, send the answers: the server
            // runs what was approved and the assistant carries on in the same reply.
            sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
            // Writes run on the server now, so a reply that changed anything refreshes the workspace.
            onFinish: ({ message }) => {
                const wrote = message.parts.some((part) => {
                    const name = safeToolName(part);
                    return !!name && getToolDescriptor(name)?.class !== "read" && (part as { state?: string }).state === "output-available";
                });
                if (wrote) void hardRefreshWorkspaceCaches(queryClient);
            },
            // The server streams the auto-title as a TRANSIENT data part on the first
            // turn (never persisted into parts) — surface it live to header + sidebar.
            onData: (part) => {
                if (part.type === CONVERSATION_TITLE_DATA_TYPE) {
                    handleTitleDataRef.current(part.data as ConversationTitleData);
                }
            },
        });

    const isStreaming = status === "submitted" || status === "streaming";

    // The live stream id for the active thread, hydrated from the conversation
    // read (`GET /conversations/:id` → `conversation.activeStreamId`). The Stop
    // control sends it so the server can guard against aborting a newer turn.
    const activeStreamIdRef = useRef<string | null>(null);

    // Current status, read by the cross-tab handler without a stale closure.
    const statusRef = useRef(status);
    statusRef.current = status;
    // True while a turn THIS tab ORIGINATED (send / retry / edit / regenerate) is in
    // flight. A resume re-attachment (mirroring another tab's turn) leaves it false,
    // so only genuine local turns broadcast — otherwise a resumed stream's own
    // streaming→ready transition would re-broadcast and two tabs would ping-pong
    // resumes forever (the spam bug). See the status-transition effect below.
    const localTurnRef = useRef(false);
    // Set when the NEXT history re-seed must NOT re-attach (resumeStream). Cross-tab
    // re-syncs use this: an idle tab mirrors a peer's turn purely by re-seeding server
    // history (the user turn on `started`, the final reply on `finished`). It must NOT
    // live-resume — re-attaching to a peer's stream proved fragile (a stuck reconnect
    // left the tab "streaming", which then made the status guard swallow the `finished`
    // re-seed, so the reply never appeared). Genuine (re)loads — refresh / reconnect /
    // thread-switch — leave this false and still resume to catch a live stream.
    const skipResumeOnNextLoadRef = useRef(false);

    // ── Cross-tab signalling (two-tab fix, doc Update 4) ─────────────────────
    // When another tab on THIS thread starts/finishes a turn, re-sync from the server:
    // clear the one-shot load marker so fresh history (the peer's new turn) is re-applied
    // by the load effect. We re-seed only (never live-resume) — see skipResumeOnNextLoadRef.
    // Apply a freshly generated/announced title to the header (when it's the active
    // thread) AND the React Query caches (sidebar list row + loaded detail), so both
    // reflect it immediately with no refetch. Never clears an existing title.
    const applyTitle = useCallback(
        (convId: string, title: string) => {
            if (!title) return;
            if (convId === conversationIdRef.current) setThreadTitle(title);
            queryClient.setQueryData<ConversationSummary[]>(queryKeys.ai.conversations, (prev) =>
                prev?.map((c) => (c.id === convId ? { ...c, title } : c)),
            );
            queryClient.setQueryData(queryKeys.ai.conversation(convId), (prev: unknown) => {
                const p = prev as { conversation?: ConversationDetail } | undefined;
                if (!p?.conversation) return prev;
                return { ...p, conversation: { ...p.conversation, title } };
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

    // Originate a turn locally: flag it so the status effect knows to broadcast
    // about it (and ONLY it), then hand off to the SDK. A resumed stream never goes
    // through these, so it stays silent and can't trigger a cross-tab resume loop.
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

    // ── Load-by-id history (Phase 2) ─────────────────────────────────────────
    // When the active thread changes, pull its persisted messages and hand them
    // to setMessages so reloaded proposals re-render in their settled state.
    // A freshly-minted thread (no server row yet) is NOT fetched — avoids a 404.
    const { data: history, error: historyError } = useConversationMessages(
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
            loadedThreadRef.current = activeConversationId;
            setMessages(history.messages as UIMessage[]);
            setThreadTitle(history.conversation?.title ?? null);
            // Re-attach ONLY on a genuine (re)load (refresh / reconnect / thread-switch) AND
            // only when a stream is actually live (activeStreamId set) — that catches a turn
            // we're not already showing. Cross-tab re-syncs set skipResume (re-seed only): the
            // peer's turn arrives via history, not a re-attach. And with no live stream, history
            // already holds the final message, so resuming would replay it onto itself and
            // double the bubble. This is the ONLY resume path (the `resume` prop is off).
            const skipResume = skipResumeOnNextLoadRef.current;
            skipResumeOnNextLoadRef.current = false;
            if (!skipResume && history.conversation?.activeStreamId) void resumeStream();
        }
    }, [activeConversationId, history, isFreshThread, setMessages, resumeStream]);

    // Hydrate the live stream id so the Stop control can send it (§8). Tracks the
    // conversation read for the active thread; null when no turn is producing.
    useEffect(() => {
        activeStreamIdRef.current = history?.conversation?.activeStreamId ?? null;
    }, [history]);

    // Reconnect-on-restore (doc Update 4 §12.3 #2): a network drop+restore without a
    // reload must re-attach to anything now live. Re-sync through the SAME gated load
    // path (refetch fresh history → the load effect resumes only if a stream is still
    // live) rather than calling resumeStream() blind — a stale local view can't tell us a
    // turn finished while offline, and resuming a finished turn would double it.
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

    // Mirror the active thread's live messages into the React Query cache whenever
    // it is settled (not mid-stream). This keeps `conversation(id)` current so
    // switching away and back shows the latest turns — fixing the stale-snapshot
    // bug where the cache held the pre-turn snapshot and the load guard locked it in.
    const syncMessagesToCache = useCallback(
        (convId: string, msgs: UIMessage[]) => {
            if (!convId || msgs.length === 0) return;
            queryClient.setQueryData(queryKeys.ai.conversation(convId), (prev: unknown) => {
                const p = prev as { conversation?: unknown } | undefined;
                return {
                    conversation:
                        p?.conversation ??
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
        if (id) syncMessagesToCache(id, messages);
    }, [status, messages, syncMessagesToCache]);

    // On a completed streamed turn (streaming → ready), the thread now exists
    // server-side and its sidebar row (title/order) may have changed.
    const prevStatusRef = useRef(status);
    useEffect(() => {
        const prev = prevStatusRef.current;
        prevStatusRef.current = status;
        const convId = conversationIdRef.current;
        if (prev === "streaming" && status === "ready") {
            setIsFreshThread(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        }
        // Cross-tab broadcasts fire ONLY for a turn this tab originated (localTurnRef).
        // A resume re-attachment leaves the flag false and stays silent — otherwise its
        // own streaming→ready transition would re-broadcast and ping-pong resumes
        // between tabs endlessly (the spam bug).
        if (!localTurnRef.current || !convId) return;
        // Producer is now live → idle tabs on this thread can attach and animate.
        if (prev === "submitted" && status === "streaming") {
            broadcastChatActivity("stream-started", convId);
        }
        // Producer reached a terminal state → idle tabs re-sync so the final message
        // shows even if they missed the live window (reliable guarantee, short turns).
        if (status === "ready" || status === "error") {
            localTurnRef.current = false;
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
            loadedThreadRef.current = null;
            setIsFreshThread(false);
            setMessages([]);
            setThreadTitle(null); // re-seeded from the chosen thread's history load
            setActiveConversation(id);
        },
        [messages, syncMessagesToCache, setActiveConversation, setMessages],
    );

    const handleNewChat = useCallback(() => {
        const outgoing = conversationIdRef.current;
        if (outgoing) syncMessagesToCache(outgoing, messages);
        loadedThreadRef.current = null;
        clientMessageIdRef.current = crypto.randomUUID();
        setIsFreshThread(true);
        setMessages([]);
        setThreadTitle(null);
        startNewConversation();
    }, [messages, syncMessagesToCache, setMessages, startNewConversation]);

    const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
        const el = scrollViewportRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
        isNearBottomRef.current = true;
    };

    // Track whether the viewport is parked near the bottom (within ~120px).
    useEffect(() => {
        const el = scrollViewportRef.current;
        if (!el) return;
        const onScroll = () => {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            isNearBottomRef.current = distanceFromBottom < 120;
            setShowJump(distanceFromBottom > 320);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // ── Send (input guard + offline guard) ───────────────────────────────────
    // Shared by the composer submit and the empty-state starter chips.
    const submitText = (raw: string) => {
        const text = raw.trim();
        if (!text || isStreaming) return;

        if (!online) {
            setInputNotice("You’re offline — I’ll be here when you’re back.");
            return;
        }
        const guard = checkMessageText(text);
        if (!guard.ok) {
            setInputNotice(guard.reason ?? null);
            return;
        }

        // Fresh idempotency token for this user turn (reused verbatim on Retry).
        clientMessageIdRef.current = crypto.randomUUID();
        setInputNotice(null);
        // Optimistic instant title for a brand-new thread so the header/sidebar never
        // sit blank — replaced by the AI title when its data part streams back (~300ms).
        const convId = conversationIdRef.current;
        if (convId && isFreshThread && messages.length === 0) {
            applyTitle(convId, deriveFallbackTitle(text));
        }
        sendLocal({ text });
        setInput("");
        if (attachments.length > 0) {
            clearAttachments();
            setInputNotice(`Sent your text — ${assistantName} can’t see images just yet.`);
        }
        requestAnimationFrame(() => scrollToBottom());
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        submitText(input);
    };

    // Hard abort (doc Update 4 §8): hit the SERVER stop endpoint FIRST (real
    // cross-isolate cancel of the model fetch + tool loop), THEN tear down the
    // local request with `chat.stop()`. Ordering is the difference between a real
    // abort and the old UI-only pseudo-cancel. Server errors are swallowed so the
    // UI still tears down.
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

    // Truncate the conversation to before the edited message and resend the new
    // text — the AI SDK prompt-editing pattern. A new turn = a new idempotency key.
    // The server mirrors the truncation via `editAnchorId` (the last KEPT message,
    // or null when the first message is edited) so the edited-away tail can't
    // resurrect from the DB on reload.
    const handleEdit = (index: number, nextText: string) => {
        if (isStreaming) void handleStop();
        clientMessageIdRef.current = crypto.randomUUID();
        const editAnchorId = index > 0 ? (messages[index - 1]?.id ?? null) : null;
        setMessages((prev) => prev.slice(0, index));
        sendLocal({ text: nextText }, { body: { editAnchorId } });
        requestAnimationFrame(() => scrollToBottom());
    };

    // Retry reuses the SAME clientMessageId so the server dedupes the user row.
    const handleRetry = useCallback(() => {
        if (!online) {
            setInputNotice("You’re offline — I’ll be here when you’re back.");
            return;
        }
        regenerateLocal();
        requestAnimationFrame(() => scrollToBottom());
    }, [online, regenerateLocal]);

    const addImages = (files: Iterable<File>) => {
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (images.length === 0) return;
        setAttachments((prev) => {
            const room = MAX_ATTACHMENTS - prev.length;
            if (images.length > room) setInputNotice(`Up to ${MAX_ATTACHMENTS} images per message.`);
            return [
                ...prev,
                ...images.slice(0, Math.max(room, 0)).map((f) => ({
                    id: crypto.randomUUID(),
                    name: f.name,
                    url: URL.createObjectURL(f),
                })),
            ];
        });
    };
    const removeAttachment = (id: string) =>
        setAttachments((prev) => {
            const gone = prev.find((a) => a.id === id);
            if (gone) URL.revokeObjectURL(gone.url);
            return prev.filter((a) => a.id !== id);
        });
    const clearAttachments = () =>
        setAttachments((prev) => {
            prev.forEach((a) => URL.revokeObjectURL(a.url));
            return [];
        });
    // Release preview blobs when the panel unmounts.
    const attachmentsRef = useRef(attachments);
    attachmentsRef.current = attachments;
    useEffect(() => () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.url)), []);

    // Auto-grow the textarea up to a comfortable cap.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [input]);

    // Clear a stale notice once the user is back online / edits the draft.
    useEffect(() => {
        if (online) setInputNotice((n) => (n?.startsWith("You’re offline") ? null : n));
    }, [online]);

    // Keep the latest message in view as the stream grows — but only if the user
    // hasn't scrolled up to read earlier turns.
    useEffect(() => {
        if (isNearBottomRef.current) scrollToBottom();
    }, [messages, status]);

    // Move focus into the composer when the panel opens (desktop only — auto-
    // focusing on mobile would pop the keyboard over the conversation). Restore
    // focus to whatever opened the panel when it closes/unmounts.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        let t: number | undefined;
        if (!isMobile) {
            t = window.setTimeout(() => textareaRef.current?.focus(), 140);
        }
        return () => {
            if (t) clearTimeout(t);
            opener?.focus?.();
        };
    }, [isMobile]);

    // Escape closes history first, then the panel. When embedded in the mobile
    // overlay (ResponsiveOverlayPanel), that shell owns Escape → close, so skip
    // this listener to avoid a double-toggle that would reopen the panel.
    useEffect(() => {
        if (isMobile) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (historyOpen) {
                setHistoryOpen(false);
            } else if (assistantPanelOpen) {
                toggleAssistantPanel();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isMobile, assistantPanelOpen, toggleAssistantPanel, historyOpen, setHistoryOpen]);

    // Index of the most recent user message — drives the read receipt.
    const lastUserIndex = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") return i;
        }
        return -1;
    }, [messages]);

    // Index of the latest assistant message — only it may be regenerated.
    const lastAssistantIndex = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "assistant") return i;
        }
        return -1;
    }, [messages]);

    const lastUserSeen = useMemo(() => {
        if (lastUserIndex === -1) return false;
        return messages
            .slice(lastUserIndex + 1)
            .some((m) => m.role === "assistant" && m.parts?.some((p) => p.type === "text" && p.text));
    }, [messages, lastUserIndex]);

    const awaitingReply = isStreaming && !lastUserSeen;

    // Receipts track the real turn, never a guess:
    //   sent      → the request is out, the server hasn't answered yet (`submitted`)
    //   delivered → the server accepted it and opened the stream, nothing produced yet
    //   read      → the assistant has actually started working on it (any text,
    //               lookup or proposal part after the latest user turn)
    const replyStarted = useMemo(() => {
        if (lastUserIndex === -1) return false;
        return messages
            .slice(lastUserIndex + 1)
            .some(
                (m) =>
                    m.role === "assistant" &&
                    m.parts?.some(
                        (p) =>
                            (p.type === "text" && Boolean(p.text)) ||
                            p.type === "reasoning" ||
                            p.type.startsWith("tool-"),
                    ),
            );
    }, [messages, lastUserIndex]);

    const receiptState: ReceiptState = replyStarted ? "read" : status === "streaming" ? "delivered" : "sent";

    // ── Stream / pre-stream error → one StreamError ──────────────────────────
    // `useChat().error` carries both pre-stream HTTP failures and the mid-stream
    // typed error part (whose text is JSON). Try the JSON parse first, then coerce.
    const streamError: StreamError | null = useMemo(() => {
        if (!error) return null;
        const msg = error instanceof Error ? error.message : "";
        if (msg.trim().startsWith("{")) return parseStreamErrorText(msg);
        return streamErrorFromError(error);
    }, [error]);

    const panelContent = (
        <div
            className={`surface-shell flex h-full flex-col ${isMobile ? "" : "photo-shell-surface"}`}
            role="dialog"
            aria-label={`${assistantName} assistant conversation`}
        >
            {/* Header — styled like a conversation thread header */}
            <header className="flex h-(--shell-header-h) shrink-0 items-center justify-between border-b border-twilight-border px-4">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20 glow-accent">
                            <AssistantSigil size={24} />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-feedback-success ring-2 ring-twilight-deep" />
                    </div>
                    <div className="min-w-0 leading-tight">
                        <h2 className="font-display text-lg font-semibold tracking-tight text-twilight-text">
                            {assistantName}
                        </h2>
                        {threadTitle ? (
                            <motion.span
                                key={threadTitle}
                                initial={reduceMotion ? false : { opacity: 0, y: 2 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                                className="block max-w-[220px] truncate text-[11px] font-medium text-twilight-text-muted"
                                title={threadTitle}
                            >
                                {threadTitle}
                            </motion.span>
                        ) : (
                            <span className="text-[11px] font-medium text-feedback-success">
                                Active now
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Tip label="New chat" side="bottom">
                        <button
                            onClick={handleNewChat}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
                            aria-label="New chat"
                        >
                            <SquarePen size={17} aria-hidden="true" />
                        </button>
                    </Tip>
                    <Tip label="Conversations" side="bottom">
                        <button
                            onClick={() => setHistoryOpen(true)}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
                            aria-label="Conversation history"
                        >
                            <History size={17} aria-hidden="true" />
                        </button>
                    </Tip>
                    <Tip label="Close assistant" side="bottom">
                        <button
                            onClick={toggleAssistantPanel}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text cursor-pointer"
                            aria-label="Close assistant"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </Tip>
                </div>
            </header>

            {/* Screen-reader status — announces assistant activity once, without
                reading every streamed token (the visible thread carries the
                content itself and is navigable). */}
            <div className="sr-only" role="status" aria-live="polite">
                {isStreaming ? `${assistantName} is responding` : ""}
            </div>

            {/* Message thread */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            <ScrollArea.Root className="flex-1 min-h-0">
                <ScrollArea.Viewport ref={scrollViewportRef} className={coarse ? "px-3 py-5" : "px-4 py-6"}>
                    <div className="flex flex-col gap-5">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-2 py-12 text-center">
                                <div className="mb-5 flex h-16 w-16 min-w-16 items-center justify-center rounded-full bg-accent-primary/12 text-accent-primary ring-1 ring-accent-primary/20 glow-accent">
                                    <AssistantSigil size={44} />
                                </div>
                                <p className="font-display text-xl font-semibold tracking-tight text-twilight-text">
                                    Say hey to {assistantName}
                                </p>
                                <p className="mt-2 max-w-[260px] text-[13px] leading-relaxed text-twilight-text-muted">
                                    Drop a messy thought, ask to clear overdue items, or plan your
                                    morning into tiny frictionless steps.
                                </p>
                                {/* Starter prompts — the empty screen invites the first act
                                    (manifesto §0.2 law 1). Each maps to a real capability. */}
                                <div className="mt-6 grid w-full max-w-[300px] gap-2">
                                    {STARTERS.map(({ prompt, icon: Icon }) => (
                                        <button
                                            key={prompt}
                                            type="button"
                                            onClick={() => submitText(prompt)}
                                            className="flex min-h-11 items-center gap-3 rounded-2xl border border-white/[0.06] bg-panel-raised/60 px-4 py-2.5 text-left text-[13px] text-twilight-text-soft transition-colors hover:border-accent-primary/30 hover:bg-accent-primary/8 hover:text-twilight-text active:scale-[0.99] cursor-pointer"
                                        >
                                            <Icon size={16} className="shrink-0 text-accent-primary" aria-hidden />
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <AnimatePresence initial={false}>
                            {messages.map((message, index) => {
                                const isUser = message.role === "user";
                                const segments = buildSegments(message.parts ?? []);
                                if (!isUser && segments.length === 0) return null;
                                const text = segments
                                    .flatMap((seg) => (seg.kind === "text" ? [seg.text] : []))
                                    .join("\n\n");
                                const grouped = index > 0 && messages[index - 1].role === message.role;
                                const isLastAssistant = index === lastAssistantIndex;
                                const failed = messageStatus(message) === "failed";
                                // Only the latest reply can still be answered, and not mid-turn.
                                const answerable = isLastAssistant && index === messages.length - 1 && !isStreaming;

                                // Failed-turn recovery after reload (§8.3); otherwise the latest
                                // user turn carries the read receipt under its avatar.
                                const meta = isUser && failed ? (
                                    <span className="text-[11px] text-twilight-text-muted">
                                        Didn’t send ·{" "}
                                        <button
                                            type="button"
                                            onClick={handleRetry}
                                            className="text-accent-primary hover:underline cursor-pointer"
                                        >
                                            Retry
                                        </button>
                                    </span>
                                ) : null;
                                const receipt =
                                    isUser && !failed && index === lastUserIndex ? (
                                        <ReadReceipt state={receiptState} />
                                    ) : null;

                                return (
                                    <div key={message.id} className={grouped ? "-mt-3" : ""}>
                                        <ChatMessage
                                            isUser={isUser}
                                            text={text}
                                            showAvatar={!grouped}
                                            latest={isUser ? index === lastUserIndex : isLastAssistant}
                                            canRegenerate={!isUser && isLastAssistant && !isStreaming}
                                            canEdit={isUser && !isStreaming}
                                            onRegenerate={() => regenerateLocal({ messageId: message.id })}
                                            onSaveEdit={(next) => handleEdit(index, next)}
                                            meta={meta}
                                            receipt={receipt}
                                            userImage={userImage}
                                            userInitial={userInitial}
                                        >
                                            {segments.map((seg, i) =>
                                                seg.kind === "text" ? (
                                                    <AssistantText key={i} text={seg.text} />
                                                ) : seg.kind === "reads" ? (
                                                    <ToolActivityChip key={i} calls={seg.calls} pending={seg.pending} />
                                                ) : (
                                                    <div key={seg.part.toolCallId || i} className="w-full">
                                                        <ToolPart
                                                            part={seg.part}
                                                            stale={!isLastAssistant}
                                                            answer={
                                                                answerable && seg.part.approval?.id
                                                                    ? (approved, reason) => answerApproval(seg.part.approval.id, approved, reason)
                                                                    : undefined
                                                            }
                                                        />
                                                    </div>
                                                ),
                                            )}
                                        </ChatMessage>
                                    </div>
                                );
                            })}
                        </AnimatePresence>

                        {/* Typed error bubble (mid-stream or pre-stream), persists in the thread */}
                        {streamError ? (
                            <ChatErrorBubble
                                error={streamError}
                                onRetry={streamError.isRetryable ? handleRetry : undefined}
                            />
                        ) : null}

                        {/* Typing indicator while Cadence composes its reply */}
                        <AnimatePresence>
                            {awaitingReply ? (
                                <motion.div
                                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                                    className="flex items-start gap-2.5"
                                >
                                    <ChatAvatar />
                                    <div className="rounded-[20px] rounded-tl-md border border-white/[0.06] bg-panel-raised/70 px-4 py-3.5">
                                        <TypingDots name={assistantName} />
                                    </div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar>
                    <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>

            <AnimatePresence>
                {showJump ? (
                    <motion.button
                        type="button"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                        onClick={() => scrollToBottom()}
                        aria-label="Jump to latest"
                        className="glass-surface absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full text-twilight-text-soft shadow-lg transition-colors hover:text-twilight-text cursor-pointer"
                    >
                        <ArrowDown size={16} aria-hidden />
                    </motion.button>
                ) : null}
            </AnimatePresence>
            </div>

            {/* Composer */}
            <form
                onSubmit={handleSubmit}
                className="shrink-0 px-3 pt-2"
                style={{
                    paddingBottom: isMobile
                        ? "max(0.75rem, env(safe-area-inset-bottom))"
                        : "0.75rem",
                }}
            >
                {/* Offline / input-cap notice (design §8.4 / §9.4) */}
                <AnimatePresence>
                    {!online || inputNotice ? (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mb-1.5 text-center text-[11px] text-twilight-text-muted"
                        >
                            {!online ? "You’re offline — I’ll be here when you’re back." : inputNotice}
                        </motion.p>
                    ) : null}
                </AnimatePresence>

                <div
                    className="rounded-[24px] border border-white/[0.08] bg-panel-raised/85 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] transition-colors focus-within:border-accent-primary/35"
                    onDragOver={(e) => {
                        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
                    }}
                    onDrop={(e) => {
                        if (e.dataTransfer.files.length === 0) return;
                        e.preventDefault();
                        addImages(e.dataTransfer.files);
                    }}
                >
                    {attachments.length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
                            {attachments.map((a) => (
                                <div key={a.id} className="relative shrink-0">
                                    <img
                                        src={a.url}
                                        alt={a.name}
                                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(a.id)}
                                        aria-label={`Remove ${a.name}`}
                                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-twilight-deep text-twilight-text-soft ring-1 ring-white/15 transition-colors hover:text-twilight-text cursor-pointer"
                                    >
                                        <X size={12} aria-hidden />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            if (inputNotice) setInputNotice(null);
                        }}
                        onKeyDown={(e) => {
                            // Touch keyboards: Return is a newline; the send button sends.
                            if (e.key === "Enter" && !e.shiftKey && !coarse) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        onPaste={(e) => {
                            if (e.clipboardData.files.length === 0) return;
                            e.preventDefault();
                            addImages(e.clipboardData.files);
                        }}
                        rows={1}
                        placeholder={`Message ${assistantName}…`}
                        aria-label={`Message ${assistantName}`}
                        // ≥16px on touch prevents iOS Safari from zooming on focus.
                        className={`block max-h-[140px] w-full resize-none bg-transparent px-4 pb-1 pt-3 leading-relaxed text-twilight-text placeholder:text-twilight-text-muted focus:outline-none ${coarse || isMobile ? "text-base" : "text-[14px]"}`}
                    />

                    <div className="flex items-center gap-1 px-2 pb-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(e) => {
                                if (e.target.files) addImages(e.target.files);
                                e.target.value = "";
                            }}
                        />
                        <Tip label="Add images" side="top">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={attachments.length >= MAX_ATTACHMENTS}
                                aria-label="Add images"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text disabled:opacity-40 cursor-pointer"
                            >
                                <Plus size={18} aria-hidden />
                            </button>
                        </Tip>

                        {/* Approval mode — Ask first (default), Auto (all but permanent deletes) or Full. */}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    type="button"
                                    aria-label={`Approval mode: ${APPROVAL_MODES[approvalMode].label}`}
                                    className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                                        approvalMode !== "ask"
                                            ? "bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/22"
                                            : "text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                                    }`}
                                >
                                    {APPROVAL_MODES[approvalMode].icon}
                                    {APPROVAL_MODES[approvalMode].label}
                                    <ChevronDown size={12} className="opacity-60" aria-hidden />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content side="top" align="start" className="w-[260px]">
                                <DropdownMenu.RadioGroup
                                    value={approvalMode}
                                    onValueChange={(v) => setApprovalMode(v as ApprovalMode)}
                                >
                                    {(Object.keys(APPROVAL_MODES) as ApprovalMode[]).map((mode) => (
                                        <DropdownMenu.RadioItem key={mode} value={mode}>
                                            <span className="flex flex-col">
                                                <span>{APPROVAL_MODES[mode].label}</span>
                                                <span className="text-[11px] font-normal text-twilight-text-muted">
                                                    {APPROVAL_MODES[mode].hint(assistantName)}
                                                </span>
                                            </span>
                                        </DropdownMenu.RadioItem>
                                    ))}
                                </DropdownMenu.RadioGroup>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>

                        <div className="flex-1" />

                        {isStreaming ? (
                            <Tip label="Stop generating" side="top">
                                <button
                                    type="button"
                                    onClick={() => void handleStop()}
                                    className="flex h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-feedback-error/30 bg-feedback-error/15 text-feedback-error transition-all hover:scale-[1.04] active:scale-[0.97] cursor-pointer"
                                    aria-label="Stop generating"
                                >
                                    <span className="h-2.5 w-2.5 rounded-sm bg-feedback-error" />
                                </button>
                            </Tip>
                        ) : (
                            <Tip label="Send message" side="top">
                                <button
                                    type="submit"
                                    disabled={!input.trim() || !online}
                                    className="flex h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[var(--primary-foreground)] shadow-[0_6px_18px_-6px_var(--accent-primary)] transition-all hover:scale-[1.04] active:scale-[0.96] disabled:pointer-events-none disabled:bg-white/[0.06] disabled:text-twilight-text-muted disabled:shadow-none cursor-pointer"
                                    aria-label="Send message"
                                >
                                    <ArrowUp size={18} strokeWidth={2.4} aria-hidden />
                                </button>
                            </Tip>
                        )}
                    </div>
                </div>
                {/* Footer: the low-budget hint takes the line over the AI disclaimer
                    only while a usage window is actually running low (§9.4). */}
                <p className="mt-2 truncate text-center text-[10px] text-twilight-text-muted">
                    {usageNotice ?? `${assistantName} is AI and can make mistakes.`}
                </p>
            </form>

            {/* History drawer overlays the thread within the same panel envelope (§7) */}
            <AnimatePresence>
                {historyOpen ? (
                    <ConversationList
                        activeConversationId={activeConversationId}
                        onClose={() => setHistoryOpen(false)}
                        onNewChat={handleNewChat}
                        onSelect={handleSelectConversation}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    );

    if (isMobile) {
        return panelContent;
    }

    return (
        <ResizableSidePanel
            ariaLabel="Resize Assistant Panel"
            width={width}
            onWidthChange={onWidthChange}
            defaultWidth={360}
            minWidth={300}
            maxWidth={520}
        >
            {panelContent}
        </ResizableSidePanel>
    );
}
