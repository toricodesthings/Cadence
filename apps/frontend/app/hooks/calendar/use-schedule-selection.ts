import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Task } from "@cadence/contracts/task";
import type { LocalDate } from "@cadence/domain/time";
import { useTaskDetailsRequest } from "../ui/use-task-details-request";
import { parseVirtualHabitId } from "../habits/use-virtual-habit-tasks";
import { getTaskSeriesId } from "../../lib/utils/task/task-scheduling";

/** What the detail panel shows: a task, or a routine on the day that was clicked. */
export type SelectedItem = { kind: "task"; id: string } | { kind: "habit"; id: string; day: LocalDate } | null;

export function useScheduleSelection(allVisibleTasks: ReadonlyMap<string, Task>, shell: { isCompact: boolean; isWide: boolean }) {
    const navigate = useNavigate();
    const [selected, setSelected] = useState<SelectedItem>(null);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelected({ kind: "task", id: taskId });
        setMobileDetailMode("peek");
    });

    const handleSelectTask = useCallback((taskId: string) => {
        const habit = parseVirtualHabitId(taskId);
        // Opening the open item again closes it.
        if (habit) {
            setSelected((current) => current?.kind === "habit" && current.id === habit.habitId && current.day === habit.day
                ? null : { kind: "habit", id: habit.habitId, day: habit.day });
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (!shell.isWide) setMobileDetailMode("peek");
        const id = task ? getTaskSeriesId(task) : taskId;
        setSelected((current) => (current?.kind === "task" && current.id === id ? null : { kind: "task", id }));
    }, [allVisibleTasks, shell.isWide]);

    const selectedTaskId = selected?.kind === "task" ? selected.id : null;
    const selectedHabit = selected?.kind === "habit" ? selected : null;
    const clearSelection = useCallback(() => setSelected(null), []);
    const openInRoutines = useCallback((habitId: string) => navigate(`/routines?routine=${habitId}`), [navigate]);

    return useMemo(() => ({
        selected, selectedTaskId, selectedHabit, clearSelection, hasSelection: selected !== null,
        mobileDetailMode, setMobileDetailMode, handleSelectTask, openInRoutines,
    }), [selected, selectedTaskId, selectedHabit, clearSelection, mobileDetailMode, handleSelectTask, openInRoutines]);
}
export type ScheduleSelection = ReturnType<typeof useScheduleSelection>;
