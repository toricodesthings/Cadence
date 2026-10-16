import { useEffect } from "react";
import { useAssistantStore } from "../../stores/assistant-store";

/**
 * Clears the assistant's unread mark once its panel is open in a visible tab. The mark itself is set when a reply
 * finishes unseen (`use-assistant-conversation`'s `onFinish`, which keeps running after the panel closes). Mounted
 * once by the shell.
 */
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
