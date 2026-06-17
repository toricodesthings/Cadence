import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { X, Send, Sparkles, History, SquarePen } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ResizableSidePanel } from "../shared/ResizableSidePanel";
import { Tip } from "../primitives";
import * as ScrollArea from "../primitives/ScrollArea";
import { useAssistantStore } from "../../stores/assistant-store";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { MessageBubble, ChatAvatar } from "./MessageBubble";
import { ReadReceipt, type ReceiptState } from "./ReadReceipt";
import { ConversationList } from "./ConversationList";
import { ChatErrorBubble } from "./ChatErrorBubble";
import { ToolActivityChip } from "./ToolActivityChip";
import { ToolPart, isReadToolPart, safeToolName, getToolDescriptor } from "./tool-registry";
import { makeChatTransport } from "../../lib/ai/chat-transport";
import { checkMessageText } from "../../lib/ai/input-guard";
import {
    parseStreamErrorText,
    streamErrorFromError,
    type StreamError,
} from "../../lib/ai/stream-error";
import { useConversationMessages } from "../../hooks/ai/use-conversations";
import { useConversationBroadcast, type ChatBroadcastType } from "../../hooks/ai/use-conversation-broadcast";
import { queryKeys } from "../../lib/api/query-keys";
import { authenticatedFetch } from "../../lib/api/client";
import { stopServerStream } from "../../lib/ai/stop-stream";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Three soft bouncing dots — the "Cadence is typing…" affordance. */
function TypingDots() {
    return (
        <span className="flex items-center gap-1 py-0.5" aria-label="Cadence is typing">
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

/** Subscribe to the browser online/offline events (offline guard, design §8.4). */
function useOnline(): boolean {
    const [online, setOnline] = useState(
        typeof navigator === "undefined" ? true : navigator.onLine,
    );
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return online;
}

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
    } = useAssistantStore();
    const { session } = useAuthState();
    const reduceMotion = useReducedMotion();
    const online = useOnline();
    const queryClient = useQueryClient();
    const [input, setInput] = useState("");
    const [inputNotice, setInputNotice] = useState<string | null>(null);
    // A brand-new (client-minted) thread has no server row yet — skip the
    // load-by-id fetch for it so we don't 404 before its first turn is sent.
    const [isFreshThread, setIsFreshThread] = useState(false);
    const scrollViewportRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Whether the user is parked near the bottom of the thread. Auto-scroll only
    // follows the stream when true, so scrolling up to re-read history mid-stream
    // is never yanked back down.
    const isNearBottomRef = useRef(true);

    const userImage = session?.user?.image;
    const userInitial = (session?.user?.name || session?.user?.email || "U")[0]!.toUpperCase();

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
    const { messages, sendMessage, regenerate, setMessages, addToolResult, status, stop, error, resumeStream } =
        useChat({
            transport,
            id: activeConversationId ?? undefined,
            resume: false,
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
    const handleRemoteActivity = useCallback(
        (_type: ChatBroadcastType, convId: string) => {
            if (convId !== conversationIdRef.current) return; // not the visible thread
            if (statusRef.current === "submitted" || statusRef.current === "streaming") return; // we're the producer
            loadedThreadRef.current = null;
            skipResumeOnNextLoadRef.current = true; // re-seed only; do not re-attach
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversation(convId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations });
        },
        [queryClient],
    );
    const broadcastChatActivity = useConversationBroadcast(handleRemoteActivity);

    // Originate a turn locally: flag it so the status effect knows to broadcast
    // about it (and ONLY it), then hand off to the SDK. A resumed stream never goes
    // through these, so it stays silent and can't trigger a cross-tab resume loop.
    const sendLocal = useCallback(
        (message: Parameters<typeof sendMessage>[0]) => {
            localTurnRef.current = true;
            sendMessage(message);
        },
        [sendMessage],
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
    const { data: history } = useConversationMessages(
        assistantPanelOpen && !isFreshThread ? activeConversationId : null,
    );
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
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // ── Send (input guard + offline guard) ───────────────────────────────────
    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        const text = input.trim();
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
        sendLocal({ text });
        setInput("");
        requestAnimationFrame(() => scrollToBottom());
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
    const handleEdit = (index: number, nextText: string) => {
        if (isStreaming) void handleStop();
        clientMessageIdRef.current = crypto.randomUUID();
        setMessages((prev) => prev.slice(0, index));
        sendLocal({ text: nextText });
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

    // Auto-grow the textarea up to a comfortable cap.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
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

    const receiptState: ReceiptState = useMemo(() => {
        if (lastUserSeen || awaitingReply) return "read";
        if (status === "submitted" || status === "streaming") return "delivered";
        return "sent";
    }, [lastUserSeen, awaitingReply, status]);

    // ── Stream / pre-stream error → one StreamError ──────────────────────────
    // `useChat().error` carries both pre-stream HTTP failures and the mid-stream
    // typed error part (whose text is JSON). Try the JSON parse first, then coerce.
    const streamError: StreamError | null = useMemo(() => {
        if (!error) return null;
        const msg = error instanceof Error ? error.message : "";
        if (msg.trim().startsWith("{")) return parseStreamErrorText(msg);
        return streamErrorFromError(error);
    }, [error]);

    // `addToolResult` from useChat is typed against this chat's tool set; our
    // messages are untyped UIMessages, so the registry passes a loose
    // `{ tool, toolCallId, output }`. Cast once here (pragmatic `any`, matching
    // the tool-part typing approach in the registry/cards).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reportToolResult = addToolResult as unknown as (args: any) => void;

    const panelContent = (
        <div
            className="aurora-accent flex h-full flex-col bg-twilight-deep/95 backdrop-blur-xl"
            role="dialog"
            aria-label="Cadence Assistant conversation"
        >
            {/* Header — styled like a conversation thread header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-twilight-border px-4">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern">
                            <Sparkles size={17} />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-feedback-success ring-2 ring-twilight-deep" />
                    </div>
                    <div className="leading-tight">
                        <h2 className="font-display text-lg font-semibold tracking-tight text-twilight-text">
                            Cadence
                        </h2>
                        <span className="text-[11px] font-medium text-feedback-success">
                            Active now
                        </span>
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
                {isStreaming ? "Cadence is responding" : ""}
            </div>

            {/* Message thread */}
            <ScrollArea.Root className="flex-1 min-h-0">
                <ScrollArea.Viewport ref={scrollViewportRef} className="px-4 py-5">
                    <div className="flex flex-col gap-3">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-14 text-center">
                                <div className="mb-4 flex h-12 w-12 min-w-12 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern">
                                    <Sparkles size={22} />
                                </div>
                                <p className="text-sm font-medium text-twilight-text">
                                    Say hey to Cadence
                                </p>
                                <p className="mt-2 max-w-[240px] text-[13px] leading-relaxed text-twilight-text-muted">
                                    Drop a messy thought, ask to clear overdue items, or plan your
                                    morning into tiny frictionless steps.
                                </p>
                            </div>
                        ) : null}

                        <AnimatePresence initial={false}>
                            {messages.map((message, index) => {
                                const isUser = message.role === "user";
                                const parts = message.parts ?? [];
                                const textParts = parts.filter(
                                    (p): p is { type: "text"; text: string } =>
                                        p.type === "text" && Boolean((p as { text?: string }).text),
                                );
                                // Tool parts split into read (grouped chip) and proposal/write (cards).
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const toolParts = parts.filter((p: any) =>
                                    typeof p.type === "string" && p.type.startsWith("tool-"),
                                );
                                const readLabels: string[] = [];
                                let readPending = false;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const cardParts: any[] = [];
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                for (const part of toolParts as any[]) {
                                    if (isReadToolPart(part)) {
                                        const name = safeToolName(part);
                                        const label = name
                                            ? getToolDescriptor(name)?.label ?? "Looked something up"
                                            : "Looked something up";
                                        readLabels.push(label);
                                        if (part.state !== "output-available") readPending = true;
                                    } else {
                                        cardParts.push(part);
                                    }
                                }

                                const prevRole = index > 0 ? messages[index - 1].role : null;
                                const grouped = prevRole === message.role;
                                const combinedText = textParts.map((p) => p.text).join("\n\n");
                                const isLastAssistant = index === lastAssistantIndex;
                                const failed = messageStatus(message) === "failed";

                                return (
                                    <div key={message.id} className={grouped ? "-mt-1.5" : ""}>
                                        {textParts.length > 0 ? (
                                            <MessageBubble
                                                text={combinedText}
                                                isUser={isUser}
                                                userImage={userImage}
                                                userInitial={userInitial}
                                                showAvatar={!grouped}
                                                canRegenerate={!isUser && isLastAssistant && !isStreaming}
                                                canEdit={isUser && !isStreaming}
                                                onRegenerate={() => regenerateLocal({ messageId: message.id })}
                                                onSaveEdit={(next) => handleEdit(index, next)}
                                            />
                                        ) : null}

                                        {/* Grouped read-tool activity chip (design §5) */}
                                        {readLabels.length > 0 ? (
                                            <div className="pl-9 pt-1.5">
                                                <ToolActivityChip labels={readLabels} pending={readPending} />
                                            </div>
                                        ) : null}

                                        {/* Proposal / write tool cards via the registry dispatcher */}
                                        {cardParts.map((part, i) => (
                                            <div key={part.toolCallId || i} className="pl-9 pt-1.5">
                                                <ToolPart part={part} addToolResult={reportToolResult} />
                                            </div>
                                        ))}

                                        {/* Failed-turn recovery after reload (§8.3) */}
                                        {isUser && failed ? (
                                            <div className="flex justify-end pr-9 pt-1">
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
                                            </div>
                                        ) : null}

                                        {/* Checkmark read receipt under the most recent user message */}
                                        {isUser && index === lastUserIndex && !failed ? (
                                            <ReadReceipt state={receiptState} />
                                        ) : null}
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
                                    className="flex items-end gap-2"
                                >
                                    <ChatAvatar isUser={false} userInitial={userInitial} />
                                    <div className="rounded-2xl rounded-bl-md border border-twilight-border bg-twilight-surface px-3.5 py-3">
                                        <TypingDots />
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

            {/* Composer */}
            <form
                onSubmit={handleSubmit}
                className="shrink-0 border-t border-twilight-border bg-twilight-deep/40 px-3 pt-2.5"
                style={{
                    paddingBottom: isMobile
                        ? "max(0.75rem, env(safe-area-inset-bottom))"
                        : "0.75rem",
                }}
            >
                {/* Offline / input-cap notice (design §8.4 / §9.4) */}
                <AnimatePresence>
                    {!online ? (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mb-1.5 text-center text-[11px] text-twilight-text-muted"
                        >
                            You’re offline — I’ll be here when you’re back.
                        </motion.p>
                    ) : inputNotice ? (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mb-1.5 text-center text-[11px] text-twilight-text-muted"
                        >
                            {inputNotice}
                        </motion.p>
                    ) : null}
                </AnimatePresence>

                <div className="flex items-end gap-2 rounded-2xl border border-twilight-border bg-twilight-surface px-3 py-2 transition-colors focus-within:border-accent-primary/40 focus-within:bg-twilight-surface-hover">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            if (inputNotice) setInputNotice(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        rows={1}
                        placeholder="Message Cadence…"
                        // ≥16px on mobile prevents iOS Safari from zooming on focus.
                        className={`max-h-[120px] flex-1 resize-none bg-transparent py-1 leading-relaxed text-twilight-text placeholder:text-twilight-text-muted focus:outline-none ${isMobile ? "text-base" : "text-[14px]"}`}
                    />
                    {isStreaming ? (
                        <button
                            type="button"
                            onClick={() => void handleStop()}
                            className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-feedback-error/30 bg-feedback-error/15 text-feedback-error transition-all hover:scale-[1.04] cursor-pointer"
                            aria-label="Stop generation"
                        >
                            <span className="h-2.5 w-2.5 rounded-sm bg-feedback-error" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!input.trim() || !online}
                            className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 text-accent-primary transition-all hover:scale-[1.04] hover:bg-accent-primary/30 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
                            aria-label="Send message"
                        >
                            <Send size={15} className="translate-x-px" />
                        </button>
                    )}
                </div>
                <p className="mt-2 truncate text-center text-[10px] text-twilight-text-muted">
                    Cadence is AI and can make mistakes.
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
