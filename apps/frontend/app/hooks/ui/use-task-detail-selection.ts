import { useState } from "react";
import { useShellMode } from "./use-shell-mode";
import { useTaskDetailsRequest } from "./use-task-details-request";

export function useTaskDetailSelection(onPick?: () => void) {
    const shell = useShellMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
        setMobilePanelOpen(true);
        onPick?.();
    });

    const handleSelectTask = (taskId: string) => {
        const next = taskId === selectedTaskId ? null : taskId;
        onPick?.();
        setSelectedTaskId(next);
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(Boolean(next));
        }
    };

    return {
        selectedTaskId,
        setSelectedTaskId,
        mobilePanelOpen,
        setMobilePanelOpen,
        mobileDetailMode,
        setMobileDetailMode,
        handleSelectTask,
    };
}
