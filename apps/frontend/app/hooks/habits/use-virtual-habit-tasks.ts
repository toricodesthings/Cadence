import { useMemo } from "react";
import { useHabitsWeekly } from "./use-habits";
import type { Task } from "../../types/task";

/**
 * Fetches habits for a date range and maps them to virtual Task objects
 * for rendering in calendar views alongside real tasks.
 */
export function useVirtualHabitTasks(options: {
    start: string;
    end: string;
    enabled: boolean;
}): Task[] {
    const { data: rawHabits = [] } = useHabitsWeekly(options);

    return useMemo<Task[]>(() => {
        return rawHabits.flatMap((h) =>
            h.logs?.filter(l => l.status !== "SKIPPED").map(l => {
                const isAllDay = !h.targetTime;
                // Use floating local time (no Z suffix) so habits appear at the correct local hour
                const scheduledStart = h.targetTime ? `${l.targetDate.substring(0, 10)}T${h.targetTime}:00` : l.targetDate;

                return {
                    id: `habit-${h.id}--${l.targetDate}`,
                    userId: h.userId,
                    projectId: h.projectId ?? null,
                    title: h.title,
                    content: h.description,
                    state: l.status === "COMPLETED" ? "COMPLETE" : "ACTIVE",
                    orderIndex: 0,
                    isAllDay,
                    dueDate: l.targetDate,
                    scheduledStart,
                    scheduledEnd: null,
                    durationEstimate: 30,
                    timezoneLocked: false,
                    createdAt: h.createdAt,
                    updatedAt: h.updatedAt,
                    priority: 0,
                    isPinned: false,
                    reminderAt: h.reminderEnabled ? "10m" : null,
                    reminderSilenced: !h.reminderEnabled,
                    recurrenceRule: h.recurrenceRule,
                    isHabit: true,
                } as Task;
            }) || []
        );
    }, [rawHabits]);
}
