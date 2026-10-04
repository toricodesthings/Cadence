import { useContext, useEffect } from "react";
import { StartupReadyContext } from "./use-workspace-startup";
import { getWalSnapshot, subscribeWal } from "../../lib/api/offline-wal";
import { useQueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useApiClient } from "../auth/use-api-client";
import { useSettings } from "./use-settings";
import { STALE_TIMES } from "../../lib/api/query-keys";
import { prefetchTaskBatch } from "../../lib/api/task-batch";
import { habitsRangeQueryOptions } from "../habits/use-habits";
import { inboxQueryOptions } from "../inbox/use-inbox";
import { projectsQueryOptions } from "../projects/use-projects";
import { tagsQueryOptions } from "../tags/use-tags";
import { getMonthDateRange, getWeekDateRange, getWeekDates, toISODate, WEEK_START_INDEX } from "../../lib/utils/date-format";

const PREFETCH_CONCURRENCY = 3;

/**
 * Keep the phone views' data saved for a week back and three weeks ahead, with
 * the same keys the views use, so they open offline even if not visited lately.
 * Batch task lists; warm at most three transports, skipping hour-fresh data.
 */
export function useOfflineWindow() {
    const startupReady = useContext(StartupReadyContext);
    const queryClient = useQueryClient();
    const client = useApiClient();
    const { data: settings } = useSettings();
    const weekStart = settings?.dateTime?.weekStart;

    useEffect(() => {
        if (!weekStart || !startupReady) return;
        let stopped = false;
        const controller = new AbortController();
        let warming = false;
        const canWarm = () => !stopped && navigator.onLine && document.visibilityState === "visible"
            && !queryClient.getQueryCache().getAll().some((q) => q.isActive() && q.state.fetchStatus === "fetching")
            && !getWalSnapshot().some((entry) => entry.status !== "failed");
        const run = () => {
            if (warming || !canWarm()) return;
            const now = new Date();
            const today = toISODate(now);
            const weeks = [-7, 0, 7, 14, 21].map((days) => addDays(now, days));
            const routineWeeks = weeks.map((day) => getWeekDates(day, WEEK_START_INDEX[weekStart]));
            const taskFilters: Parameters<typeof prefetchTaskBatch>[2] = [
                { state: "ACTIVE" }, // Upcoming, lists, tags
                { state: "WAITING" },
                { state: "ACTIVE", effectiveOnOrBeforeDate: today }, // Today
                { state: "ACTIVE", hasNoProject: true, hasNoDate: true }, // Capture
                ...weeks.map((day) => ({ state: "ACTIVE" as const, scheduledRange: getWeekDateRange(day) })), // Schedule
            ];
            const queries = [
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
            const pending = [
                () => prefetchTaskBatch(client, queryClient, taskFilters, controller.signal),
                ...(queries as unknown as FetchQueryOptions[]).map((query) =>
                    () => queryClient.prefetchQuery({ ...query, staleTime: STALE_TIMES.OFFLINE_WINDOW })),
            ].values();
            const warm = async () => {
                while (canWarm()) {
                    const next = pending.next();
                    if (next.done) return;
                    await next.value();
                }
            };
            warming = true;
            // Background reads must leave room for the view the person is opening.
            void Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, warm))
                .finally(() => { warming = false; });
        };

        run();
        const timer = window.setInterval(run, STALE_TIMES.OFFLINE_WINDOW);
        document.addEventListener("visibilitychange", run);
        window.addEventListener("online", run);
        // A foreground read completing makes background work eligible again.
        const unsubscribe = queryClient.getQueryCache().subscribe(() => { queueMicrotask(run); });
        const unsubscribeWal = subscribeWal(run);
        return () => {
            stopped = true;
            controller.abort();
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", run);
            window.removeEventListener("online", run);
            unsubscribe();
            unsubscribeWal();
        };
    }, [client, queryClient, weekStart, startupReady]);
}
