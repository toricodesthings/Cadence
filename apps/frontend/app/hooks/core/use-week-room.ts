import { useCallback, useMemo } from "react";
import { addDays, dayOf, type LocalDate } from "@cadence/domain/time";
import { dispositionDay, weekRoom } from "@cadence/domain/fit-day";
import { dayHoursOf } from "@cadence/domain/find-time";
import { useTasks } from "../tasks/use-tasks";
import { useHabitsRange } from "../habits/use-habits";
import { useSettings } from "./use-settings";
import { useToday, useUserZone } from "../../lib/utils/user-zone";
import { isRoutinePaused } from "../../lib/utils/habits";
import { useLoadShare } from "../sharing/use-load-share";

const UNSIZED_MINUTES = 30;

export function useWeekRoom() {
    const today = useToday();
    const zone = useUserZone();
    const end = addDays(today, 6);
    const { data: settings } = useSettings();
    const { data: tasks = [], isLoading: tasksLoading } = useTasks({
        state: "ACTIVE",
        range: { from: today, to: end },
    });
    const { data: habits = [], isLoading: habitsLoading } = useHabitsRange({ start: today, end });
    const weekStart = settings?.dateTime?.weekStart ?? "Sunday";
    const { timelineStartHour, dayEndHour } = dayHoursOf(settings);
    const shareOf = useLoadShare();

    const room = useMemo(() => {
        const days = weekRoom(
            tasks.map((t) => ({ ...t, share: shareOf(t) })),
            {
                from: today,
                days: 7,
                zone,
                timelineStartHour,
                dayEndHour,
                now: new Date().toISOString(),
            },
        );
        return days.map((d) => {
            const routines = habits.filter(
                (h) =>
                    !h.archived &&
                    !isRoutinePaused(h, d.day) &&
                    (h.logs ?? []).some((l) => l.targetDate === d.day && l.status === "PENDING"),
            );
            const blocks = tasks
                .filter((t) => t.scheduledStart && dayOf(t.scheduledStart, zone) === d.day)
                .sort((a, b) => Date.parse(a.scheduledStart!) - Date.parse(b.scheduledStart!));
            const due = tasks.filter((t) => !t.scheduledStart && t.dueDate === d.day);
            return { ...d, routines, routinesDue: routines.length, blocks, due };
        });
    }, [tasks, habits, today, zone, timelineStartHour, dayEndHour, shareOf]);

    const dayFor = useCallback(
        (bucket: "today" | "this_week" | "next_week", minutes: number | null | undefined): LocalDate =>
            dispositionDay(bucket, { today, room, minutes: minutes || UNSIZED_MINUTES, weekStart }),
        [today, room, weekStart],
    );

    return { room, dayFor, isLoading: tasksLoading || habitsLoading };
}
