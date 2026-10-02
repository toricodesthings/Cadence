import { useEffect } from "react";
import { useQueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useApiClient } from "../auth/use-api-client";
import { useSettings } from "./use-settings";
import { tasksQueryOptions } from "../tasks/use-tasks";
import { habitsRangeQueryOptions } from "../habits/use-habits";
import { inboxQueryOptions } from "../inbox/use-inbox";
import { projectsQueryOptions } from "../projects/use-projects";
import { tagsQueryOptions } from "../tags/use-tags";
import { getMonthDateRange, getWeekDateRange, getWeekDates, toISODate, WEEK_START_INDEX } from "../../lib/utils/date-format";

const HOUR = 60 * 60 * 1000;
const PREFETCH_CONCURRENCY = 3;

/**
 * Keep the phone views' data saved for a week back and three weeks ahead, with
 * the same keys the views use, so they open offline even if not visited lately.
 * Warm three queries at a time; anything fetched in the last hour is skipped.
 */
export function useOfflineWindow() {
    const queryClient = useQueryClient();
    const client = useApiClient();
    const { data: settings } = useSettings();
    const weekStart = settings?.dateTime?.weekStart;

    useEffect(() => {
        if (!weekStart) return;
        let stopped = false;
        let warming = false;
        const canWarm = () => !stopped && navigator.onLine && document.visibilityState === "visible";
        const run = () => {
            if (warming || !canWarm()) return;
            const now = new Date();
            const today = toISODate(now);
            const weeks = [-7, 0, 7, 14, 21].map((days) => addDays(now, days));
            const routineWeeks = weeks.map((day) => getWeekDates(day, WEEK_START_INDEX[weekStart]));
            const queries = [
                tasksQueryOptions(client, { state: "ACTIVE" }), // Upcoming, lists, tags
                tasksQueryOptions(client, { state: "WAITING" }),
                tasksQueryOptions(client, { state: "ACTIVE", effectiveOnOrBeforeDate: today }), // Today
                tasksQueryOptions(client, { state: "ACTIVE", hasNoProject: true, hasNoDate: true }), // Capture
                ...weeks.map((day) => tasksQueryOptions(client, { state: "ACTIVE", scheduledRange: getWeekDateRange(day) })), // Schedule
                habitsRangeQueryOptions(client, { start: today, end: today }), // Today
                habitsRangeQueryOptions(client, { start: toISODate(addDays(now, -30)), end: toISODate(addDays(now, 7)) }), // Upcoming
                ...weeks.map((day) => habitsRangeQueryOptions(client, getWeekDateRange(day))), // Schedule
                ...routineWeeks.map((days) => habitsRangeQueryOptions(client, { start: toISODate(days[0]), end: toISODate(days[6]) })), // Routines
                habitsRangeQueryOptions(client, getMonthDateRange(now.getFullYear(), now.getMonth())), // Routines month
                inboxQueryOptions(client),
                projectsQueryOptions(client),
                tagsQueryOptions(client),
            ];
            // Each entry is typed by its own factory; together they're just queries to warm.
            const pending = (queries as unknown as FetchQueryOptions[]).values();
            const warm = async () => {
                while (canWarm()) {
                    const next = pending.next();
                    if (next.done) return;
                    await queryClient.prefetchQuery({ ...next.value, staleTime: HOUR });
                }
            };
            warming = true;
            // Background reads must leave room for the view the person is opening.
            void Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, warm))
                .finally(() => { warming = false; });
        };

        run();
        const timer = window.setInterval(run, HOUR);
        document.addEventListener("visibilitychange", run);
        window.addEventListener("online", run);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", run);
            window.removeEventListener("online", run);
        };
    }, [client, queryClient, weekStart]);
}
