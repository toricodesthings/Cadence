import { useCallback, useEffect, useRef } from "react";

const CHANNEL_NAME = "cadence:ai:chat";

const TAB_ID = crypto.randomUUID();

export type ChatBroadcastType = "stream-started" | "stream-finished" | "title-updated";

interface ChatBroadcastMessage {
    type: ChatBroadcastType;
    conversationId: string;
    senderId: string;
    title?: string;
}

export function useConversationBroadcast(
    onRemoteActivity: (type: ChatBroadcastType, conversationId: string, title?: string) => void,
): (type: ChatBroadcastType, conversationId: string, title?: string) => void {
    const channelRef = useRef<BroadcastChannel | null>(null);
    const handlerRef = useRef(onRemoteActivity);
    handlerRef.current = onRemoteActivity;

    useEffect(() => {
        if (typeof BroadcastChannel === "undefined") return;
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
        const onMessage = (event: MessageEvent<ChatBroadcastMessage>) => {
            const msg = event.data;
            if (!msg || msg.senderId === TAB_ID) return;
            handlerRef.current(msg.type, msg.conversationId, msg.title);
        };
        channel.addEventListener("message", onMessage);
        return () => {
            channel.removeEventListener("message", onMessage);
            channel.close();
            channelRef.current = null;
        };
    }, []);

    return useCallback((type: ChatBroadcastType, conversationId: string, title?: string) => {
        channelRef.current?.postMessage({
            type,
            conversationId,
            senderId: TAB_ID,
            title,
        } satisfies ChatBroadcastMessage);
    }, []);
}
