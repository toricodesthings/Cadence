/**
 * Cross-tab chat signalling (doc Update 4 — two-tab fix).
 *
 * `useChat({ resume })` only re-attaches on mount and on offline→online, and the
 * React Query cache is per-tab — so an idle second tab viewing a thread learns
 * NOTHING when another tab sends a turn on the same thread: it gets neither the
 * live stream nor (because its history load is one-shot) the DB fallback, and sits
 * blank until a manual reload.
 *
 * BroadcastChannel bridges same-origin tabs with no server push (Upstash REST has
 * no pub/sub, so the live signal must be client-side). The producing tab announces
 * `stream-started` / `stream-finished`; idle tabs on that conversation re-sync from
 * the server (the same seed-history-then-resume flow a refresh runs), with the
 * backend's grace-replay catching even short turns that already finished.
 */
import { useCallback, useEffect, useRef } from "react";

const CHANNEL_NAME = "cadence:ai:chat";

/**
 * Unique per browsing context (tab). Module-level so every hook instance in this
 * tab shares ONE id — lets a tab ignore its own broadcasts even when more than one
 * channel exists in the tab (e.g. React StrictMode's double-mount in dev), which
 * BroadcastChannel's own "don't echo to the sender" rule does not cover.
 */
const TAB_ID =
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

export type ChatBroadcastType = "stream-started" | "stream-finished";

interface ChatBroadcastMessage {
    type: ChatBroadcastType;
    conversationId: string;
    senderId: string;
}

/**
 * Subscribe to cross-tab chat activity and get a `broadcast` function back.
 * `onRemoteActivity` fires only for messages from OTHER tabs; the caller decides
 * whether the event is relevant to the thread it is currently showing.
 */
export function useConversationBroadcast(
    onRemoteActivity: (type: ChatBroadcastType, conversationId: string) => void,
): (type: ChatBroadcastType, conversationId: string) => void {
    const channelRef = useRef<BroadcastChannel | null>(null);
    // Keep the latest handler without re-subscribing the channel on every render.
    const handlerRef = useRef(onRemoteActivity);
    handlerRef.current = onRemoteActivity;

    useEffect(() => {
        if (typeof BroadcastChannel === "undefined") return; // SSR / unsupported
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
        const onMessage = (event: MessageEvent<ChatBroadcastMessage>) => {
            const msg = event.data;
            if (!msg || msg.senderId === TAB_ID) return; // ignore this tab's own posts
            handlerRef.current(msg.type, msg.conversationId);
        };
        channel.addEventListener("message", onMessage);
        return () => {
            channel.removeEventListener("message", onMessage);
            channel.close();
            channelRef.current = null;
        };
    }, []);

    return useCallback((type: ChatBroadcastType, conversationId: string) => {
        channelRef.current?.postMessage({
            type,
            conversationId,
            senderId: TAB_ID,
        } satisfies ChatBroadcastMessage);
    }, []);
}
