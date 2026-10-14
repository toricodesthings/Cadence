import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import type { Task } from "@cadence/contracts/task";
import { useTaskDetailsRequest } from "../ui/use-task-details-request";
import { getTaskSeriesId } from "../../lib/utils/task/task-scheduling";

export function useScheduleSelection(allVisibleTasks: ReadonlyMap<string, Task>, shell: { isCompact: boolean; isWide: boolean }) {
    const navigate = useNavigate();
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
    });

    const handleSelectTask = useCallback((taskId: string) => {
        if (taskId.startsWith("habit-")) {
            // Compact shells open the routine in the same sheet tasks use; desktop has its page.
            const habitId = taskId.split("--")[0].replace(/^habit-/, "");
            if (shell.isCompact) setSelectedHabitId((current) => (current === habitId ? null : habitId));
            else navigate("/routines");
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (!shell.isWide) {
            setMobileDetailMode("peek");
        }
        const id = task ? getTaskSeriesId(task) : taskId;
        // Opening the open task again closes it.
        setSelectedTaskId((current) => (current === id ? null : id));
    }, [allVisibleTasks, shell.isCompact, shell.isWide, navigate]);

    return { selectedTaskId, setSelectedTaskId, selectedHabitId, setSelectedHabitId,
        mobileDetailMode, setMobileDetailMode, handleSelectTask };
}
export type ScheduleSelection = ReturnType<typeof useScheduleSelection>;
