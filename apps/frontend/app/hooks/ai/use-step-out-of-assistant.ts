import { useCallback } from "react";
import { getShellMode } from "../ui/use-shell-mode";
import { useAssistantStore } from "../../stores/assistant-store";

/**
 * Before the assistant sends someone elsewhere (a link, Settings): on phone and
 * tablet its sheet covers the page, so close it. Desktop keeps the panel open.
 */
export function useStepOutOfAssistant(): () => void {
    const setAssistantPanelOpen = useAssistantStore((s) => s.setAssistantPanelOpen);
    return useCallback(() => {
        const shell = getShellMode(window.innerWidth);
        if (shell === "phone" || shell === "tablet") setAssistantPanelOpen(false);
    }, [setAssistantPanelOpen]);
}
