import { useEffect } from "react";
import { useAssistantStore } from "../../stores/assistant-store";
import { useConversationMessages } from "./use-conversations";

/**
 * Keeps the assistant's unread mark honest while its panel is closed: a reply still
 * coming when the panel closed is polled until it lands, and the mark clears once the
 * panel is open in a visible tab. Mounted once by the shell.
 */
export function useAssistantReplyWatcher() {
    const { assistantPanelOpen, pendingReply, setReplyUnread } = useAssistantStore();
    const { data, dataUpdatedAt } = useConversationMessages(
        assistantPanelOpen ? null : (pendingReply?.conversationId ?? null),
        3_000,
    );

    useEffect(() => {
        if (!pendingReply || !data || dataUpdatedAt <= pendingReply.since) return;
        if (!data.conversation?.activeStreamId) setReplyUnread(true);
    }, [pendingReply, data, dataUpdatedAt, setReplyUnread]);

    useEffect(() => {
        if (!assistantPanelOpen) return;
        const seen = () => {
            const { replyUnread, pendingReply: pending } = useAssistantStore.getState();
            if (!document.hidden && (replyUnread || pending)) setReplyUnread(false);
        };
        seen();
        document.addEventListener("visibilitychange", seen);
        return () => document.removeEventListener("visibilitychange", seen);
    }, [assistantPanelOpen, setReplyUnread]);
}
