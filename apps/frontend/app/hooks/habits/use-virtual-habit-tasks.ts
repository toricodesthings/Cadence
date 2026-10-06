import { useMemo } from "react";
import { useHabitsRange } from "./use-habits";
import type { Task } from "@cadence/contracts/task";
import { routineTimeOn } from "@cadence/domain/repeats";
import type { LocalDate } from "@cadence/domain/time";
import { fromTimeValue } from "../../lib/utils/date-format";

/** A routine day drawn as a task, carrying the routine's mark and colour for schedule pills. */
export type VirtualHabitTask = Task & { habitEmoji?: string | null; habitColor?: string | null };
import { getUserZone } from "../../lib/utils/user-zone";

/**
 * Fetches habits for a date range and maps them to virtual Task objects
 * for rendering in calendar views alongside real tasks.
 */
export function useVirtualHabitTasks(options: {
    start: LocalDate;
    end: LocalDate;
    enabled: boolean;
}): Task[] {
    const { data: rawHabits = [] } = useHabitsRange(options);

    return useMemo<Task[]>(() => {
        return rawHabits.flatMap((h) =>
            h.logs?.filter(l => l.status !== "SKIPPED").map(l => {
                const time = routineTimeOn(h, l.targetDate);
                return {
                    id: `habit-${h.id}--${l.targetDate}`,
                    userId: h.userId,
                    projectId: h.projectId ?? null,
                    title: h.title,
                    content: h.description,
                    state: l.status === "COMPLETED" ? "COMPLETE" : "ACTIVE",
                    orderIndex: 0,
                    // A timed routine day is a timed block (its wall time on that day); an anytime day is all-day.
                    dueDate: time ? null : l.targetDate,
                    endDate: null,
                    scheduledStart: time ? fromTimeValue(l.targetDate, time) : null,
                    scheduledEnd: null,
                    zone: time ? getUserZone() : null,
                    durationEstimate: 30,
                    timezoneLocked: false,
                    createdAt: h.createdAt,
                    updatedAt: h.updatedAt,
                    priority: 0,
                    isPinned: false,
                    reminderAt: null,
                    reminderSilenced: !h.reminderEnabled,
                    recurrenceRule: h.recurrenceRule,
                    isHabit: true,
                    // Routine identity for schedule pills (`RoutineMark` + `routineTone`); not part of the Task contract.
                    habitEmoji: h.emoji,
                    habitColor: h.colorAccent,
                } as VirtualHabitTask;
            }) || []
        );
    }, [rawHabits]);
}
