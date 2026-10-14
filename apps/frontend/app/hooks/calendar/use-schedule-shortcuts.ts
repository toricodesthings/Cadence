import { useEffect } from "react";
import type { ScheduleNavigation } from "./use-schedule-navigation";
import type { ScheduleCreation } from "./use-schedule-creation";
import type { ScheduleSelection } from "./use-schedule-selection";

export function useScheduleShortcuts(
    { selectViewShortcut, handleToday, handleNavigate }: Pick<ScheduleNavigation, "selectViewShortcut" | "handleToday" | "handleNavigate">,
    { popover, close, handleAddTaskShortcut }: Pick<ScheduleCreation, "popover" | "close" | "handleAddTaskShortcut">,
    { selectedTaskId, setSelectedTaskId }: Pick<ScheduleSelection, "selectedTaskId" | "setSelectedTaskId">,
) {
    useEffect(() => {
        const actions = new Map<string, () => void>([
            ["d", () => selectViewShortcut("day")], ["w", () => selectViewShortcut("week")],
            ["m", () => selectViewShortcut("month")], ["y", () => selectViewShortcut("year")],
            ["t", handleToday], ["c", handleAddTaskShortcut],
            ["escape", () => { if (popover) close(); else if (selectedTaskId) setSelectedTaskId(null); }],
            ["arrowleft", () => handleNavigate(-1)], ["arrowright", () => handleNavigate(1)],
        ]);
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable)) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const action = actions.get(event.key.toLowerCase());
            if (action) { event.preventDefault(); action(); }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectViewShortcut, handleToday, handleNavigate, popover, close, handleAddTaskShortcut, selectedTaskId, setSelectedTaskId]);
}
