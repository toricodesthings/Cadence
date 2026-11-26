import { useCallback } from "react";
import { currentShellMode } from "../ui/use-shell-mode";
import { useAssistantStore } from "../../stores/assistant-store";

export function useStepOutOfAssistant(): () => void {
    const setAssistantPanelOpen = useAssistantStore((s) => s.setAssistantPanelOpen);
    return useCallback(() => {
        const shell = currentShellMode();
        if (shell === "phone" || shell === "tablet") setAssistantPanelOpen(false);
    }, [setAssistantPanelOpen]);
}
