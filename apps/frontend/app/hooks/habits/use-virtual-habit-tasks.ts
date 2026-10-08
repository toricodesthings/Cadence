import { useMemo } from "react";
import { useHabitsRange } from "./use-habits";
import type { Task } from "@cadence/contracts/task";
import { routineTimeOn, timeMarksOn } from "@cadence/domain/repeats";
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
            h.logs?.flatMap((l) => {
                // A routine at set times is one block per time that isn't skipped; otherwise one block, unless the day was skipped.
                const marks = h.times?.length ? timeMarksOn(h.times, l) : null;
                const slots = marks
                    ? h.times!.filter((t) => marks[t]?.status !== "SKIPPED").map((t) => ({ time: t, complete: marks[t]?.status === "COMPLETED", suffix: `--${t}` }))
                    : l.status === "SKIPPED" ? [] : [{ time: routineTimeOn(h, l.targetDate), complete: l.status === "COMPLETED", suffix: "" }];
                return slots.map(({ time, complete, suffix }) => ({
                    id: `habit-${h.id}--${l.targetDate}${suffix}`,
                    userId: h.userId,
                    projectId: h.projectId ?? null,
                    title: h.title,
                    content: h.description,
                    state: complete ? "COMPLETE" : "ACTIVE",
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
                } as VirtualHabitTask));
            }) || []
        );
    }, [rawHabits]);
}
