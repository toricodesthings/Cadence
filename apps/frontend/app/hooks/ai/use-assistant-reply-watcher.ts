import { useEffect } from "react";
import { useAssistantStore } from "../../stores/assistant-store";

export function useAssistantReplyWatcher() {
    const { assistantPanelOpen, setReplyUnread } = useAssistantStore();

    useEffect(() => {
        if (!assistantPanelOpen) return;
        const seen = () => {
            if (!document.hidden && useAssistantStore.getState().replyUnread) setReplyUnread(false);
        };
        seen();
        document.addEventListener("visibilitychange", seen);
        return () => document.removeEventListener("visibilitychange", seen);
    }, [assistantPanelOpen, setReplyUnread]);
}
