import { useMemo } from "react";
import { useAuthState } from "../auth/use-auth-state";
import { useHabitsRange } from "./use-habits";
import type { Task } from "@cadence/contracts/task";
import { routineTimeOn, timeMarksOn } from "@cadence/domain/repeats";
import type { LocalDate } from "@cadence/domain/time";
import { fromTimeValue } from "../../lib/utils/date-format";

export type VirtualHabitTask = Task & { habitEmoji?: string | null; habitColor?: string | null };
import { getUserZone } from "../../lib/utils/user-zone";

export function parseVirtualHabitId(id: string): { habitId: string; day: LocalDate; time: string | null } | null {
    if (!id.startsWith("habit-")) return null;
    const [head, day, time] = id.split("--", 3);
    if (!day) return null;
    return { habitId: head.slice("habit-".length), day: day as LocalDate, time: time ?? null };
}

export function useVirtualHabitTasks(options: { start: LocalDate; end: LocalDate; enabled: boolean }): Task[] {
    const { data: rawHabits = [] } = useHabitsRange(options);
    const { session } = useAuthState();
    const me = session?.user.id;

    return useMemo<Task[]>(() => {
        return rawHabits
            .filter((h) => h.access !== "view")
            .flatMap(
                (h) =>
                    h.logs?.flatMap((l) => {
                        if (h.shareMode === "turns" && me) {
                            const turnHolder = h.days?.[l.targetDate]?.turn ?? h.today?.turn;
                            if (turnHolder && turnHolder !== me) return [];
                        }
                        const marks = h.times?.length ? timeMarksOn(h.times, l) : null;
                        const slots = marks
                            ? h
                                  .times!.filter((t) => marks[t]?.status !== "SKIPPED")
                                  .map((t) => ({
                                      time: t,
                                      complete: marks[t]?.status === "COMPLETED",
                                      suffix: `--${t}`,
                                  }))
                            : l.status === "SKIPPED"
                              ? []
                              : [
                                    {
                                        time: routineTimeOn(h, l.targetDate),
                                        complete: l.status === "COMPLETED",
                                        suffix: "",
                                    },
                                ];
                        return slots.map(
                            ({ time, complete, suffix }) =>
                                ({
                                    id: `habit-${h.id}--${l.targetDate}${suffix}`,
                                    userId: h.userId,
                                    projectId: h.projectId ?? null,
                                    title: h.title,
                                    content: h.description,
                                    state: complete ? "COMPLETE" : "ACTIVE",
                                    orderIndex: 0,
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
                                    habitEmoji: h.emoji,
                                    habitColor: h.colorAccent,
                                }) as VirtualHabitTask,
                        );
                    }) || [],
            );
    }, [rawHabits, me]);
}
