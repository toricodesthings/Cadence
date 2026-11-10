import { useCallback, useMemo } from "react";
import { addDays, dayOf, type LocalDate } from "@cadence/domain/time";
import { dispositionDay, weekRoom } from "@cadence/domain/fit-day";
import { useTasks } from "../tasks/use-tasks";
import { useHabitsRange } from "../habits/use-habits";
import { useSettings } from "./use-settings";
import { useToday, useUserZone } from "../../lib/utils/user-zone";
import { isRoutinePaused } from "../../lib/utils/habits";

/** ponytail: a task with no estimate counts as 30 minutes when choosing a day for it; use guesses if that reads wrong. */
const UNSIZED_MINUTES = 30;

/**
 * The next 7 days (today first): booked and open minutes, deadlines and due routines per day, from the same
 * `weekRoom` the server uses, plus each day's blocks, due tasks and routines for its view. `dayFor` turns a reset
 * bucket into a real day.
 */
export function useWeekRoom() {
    const today = useToday();
    const zone = useUserZone();
    const end = addDays(today, 6);
    const { data: settings } = useSettings();
    const { data: tasks = [] } = useTasks({ state: "ACTIVE", range: { from: today, to: end } });
    const { data: habits = [] } = useHabitsRange({ start: today, end });
    const weekStart = settings?.dateTime?.weekStart ?? "Sunday";
    const timelineStartHour = settings?.calendar?.timelineStartHour ?? 7;

    const room = useMemo(() => {
        const days = weekRoom(tasks, { from: today, days: 7, zone, timelineStartHour, now: new Date().toISOString() });
        return days.map((d) => {
            const routines = habits.filter((h) => !h.archived && !isRoutinePaused(h, d.day) && (h.logs ?? []).some((l) => l.targetDate === d.day && l.status === "PENDING"));
            // The day's own view: timed blocks in time order, then what's due with no time.
            const blocks = tasks
                .filter((t) => t.scheduledStart && dayOf(t.scheduledStart, zone) === d.day)
                .sort((a, b) => Date.parse(a.scheduledStart!) - Date.parse(b.scheduledStart!));
            const due = tasks.filter((t) => !t.scheduledStart && t.dueDate === d.day);
            return { ...d, routines, routinesDue: routines.length, blocks, due };
        });
    }, [tasks, habits, today, zone, timelineStartHour]);

    const dayFor = useCallback(
        (bucket: "today" | "this_week" | "next_week", minutes: number | null | undefined): LocalDate =>
            dispositionDay(bucket, { today, room, minutes: minutes || UNSIZED_MINUTES, weekStart }),
        [today, room, weekStart],
    );

    return { room, dayFor };
}
