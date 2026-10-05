import { tool } from "ai";
import { z } from "zod";
import { and, eq, gte, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tasks, habits } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { localDaySql, placeNameColumns } from "./tasks";
import { isDateOnly, normalizeStartBoundary, normalizeEndBoundary } from "@cadence/contracts/common";
import { expandScheduleScopedTasks } from "@cadence/domain/task-recurrence";
import { addDaysToDate, isPausedOn, localDay } from "@cadence/domain/repeats";
import { taskLocalDay, toMinimalTask } from "./projections";
import { expandOccurrences } from "../../habits/habits.service";

/** Hard cap on the span a single schedule-window read may cover. */
const MAX_RANGE_DAYS = 62;

/** The task columns a schedule window projects. */
const scheduleColumns = {
    ...placeNameColumns,
    id: tasks.id,
    title: tasks.title,
    state: tasks.state,
    isAllDay: tasks.isAllDay,
    dueDate: tasks.dueDate,
    scheduledStart: tasks.scheduledStart,
    scheduledEnd: tasks.scheduledEnd,
    durationEstimate: tasks.durationEstimate,
    priority: tasks.priority,
    effort: tasks.effort,
    projectId: tasks.projectId,
    sectionId: tasks.sectionId,
    waitingOn: tasks.waitingOn,
    interactionMode: tasks.interactionMode,
    recurrenceRule: tasks.recurrenceRule,
    orderIndex: tasks.orderIndex,
    isPinned: tasks.isPinned,
    reminderAt: tasks.reminderAt,
} as const;

/** Routines with the days they're due in [from, to], skipping paused days; none due → left out. */
export function routinesDue(
    rows: { id: string; title: string; recurrenceRule: string; targetTime: string | null; createdAt: string; pausedUntil: string | null }[],
    from: string,
    to: string,
    today: string,
    timeZone = "UTC",
) {
    return rows.flatMap((row) => {
        const days = expandOccurrences(row.recurrenceRule, row.createdAt, new Date(`${from}T00:00:00.000Z`), new Date(`${to}T23:59:59.999Z`), timeZone)
            .filter((day) => !isPausedOn(row.pausedUntil, day, today));
        return days.length ? [{ id: row.id, title: row.title, days, targetTime: row.targetTime }] : [];
    });
}

/** Rows a window reads before expansion: plenty for ~2 months, a guard against runaway data. */
const WINDOW_ROW_GUARD = 500;

export const calendarTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_schedule_window: tool({
        description:
            "Open tasks and the routines due on each day of a local date range (inclusive, up to ~2 months), " +
            "for planning, sorted by day and time. Repeating tasks appear once per occurrence. fixedBlock:true = a class or shift: it " +
            "takes that time, can't be checked off and is never overdue. Tasks page with offset: more:true and nextOffset when there's more.",
        inputSchema: z.object({
            start: z.string().describe("First local date (a datetime is reduced to its local date)."),
            end: z.string().describe("Last local date."),
            includeDone: z.boolean().default(false).describe("Also tasks already done."),
            offset: z.number().int().min(0).max(100_000).optional().describe("From nextOffset; omit for the first page."),
            limit: z.number().int().min(1).max(50).default(50),
        }),
        execute: async ({ start, end, includeDone, offset = 0, limit }) =>
            safeExecute("get_schedule_window", userId, async () => {
                // Work in the user's local dates; a datetime is reduced to its local day.
                const dayOf = (value: string) => (isDateOnly(value) ? value : localDay(value, ctx.timezone));
                const from = dayOf(start);
                let to = dayOf(end);
                // Clamp the span server-side so a huge range can't be requested.
                const maxTo = addDaysToDate(from, MAX_RANGE_DAYS);
                if (to > maxTo) to = maxTo;
                const cap = clampLimit(limit, 50);
                const localDayOf = localDaySql(ctx.timezone);

                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const open = and(
                        eq(tasks.userId, userId),
                        // Trash never, Done only when asked.
                        ne(tasks.state, "ARCHIVED"),
                        includeDone ? undefined : ne(tasks.state, "COMPLETE"),
                    );
                    // Dated one-offs in the window, matched on their exact local day in SQL.
                    const dated = await tx
                        .select(scheduleColumns)
                        .from(tasks)
                        .where(and(open, isNull(tasks.recurrenceRule), gte(localDayOf, from), lte(localDayOf, to)))
                        .limit(WINDOW_ROW_GUARD + 1);
                    // A repeating series is stored at its first date; every one may land in the window.
                    const series = await tx
                        .select(scheduleColumns)
                        .from(tasks)
                        .where(and(open, isNotNull(tasks.recurrenceRule)))
                        .limit(WINDOW_ROW_GUARD);

                    const habitRows = await tx
                        .select({
                            id: habits.id,
                            title: habits.title,
                            recurrenceRule: habits.recurrenceRule,
                            targetTime: habits.targetTime,
                            createdAt: habits.createdAt,
                            pausedUntil: habits.pausedUntil,
                        })
                        .from(habits)
                        .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
                        .orderBy(habits.sortOrder)
                        .limit(50);

                    // Same expansion as GET /tasks for a date range: each occurrence of a
                    // repeating series lands on its own day instead of the series' first date.
                    const expanded = expandScheduleScopedTasks(series, {
                        scheduledRangeStart: normalizeStartBoundary(addDaysToDate(from, -1)),
                        scheduledRangeEnd: normalizeEndBoundary(addDaysToDate(to, 1)),
                    });
                    const when = (row: (typeof dated)[number]) => `${taskLocalDay(row, ctx.timezone)} ${row.isAllDay ? "" : row.scheduledStart ?? row.dueDate}`;
                    const inRange = [
                        ...dated.slice(0, WINDOW_ROW_GUARD),
                        ...expanded.filter((row) => {
                            const day = taskLocalDay(row, ctx.timezone);
                            return day !== null && day >= from && day <= to;
                        }),
                    ].sort((a, b) => when(a).localeCompare(when(b)));
                    const shown = inRange.slice(offset, offset + cap);
                    const more = inRange.length > offset + cap || dated.length > WINDOW_ROW_GUARD;
                    return {
                        range: { start: from, end: to, timezone: ctx.timezone },
                        tasks: shown.map((row) => toMinimalTask(row, ctx.timezone)),
                        ...(more && { more, nextOffset: offset + cap }),
                        routines: routinesDue(habitRows, from, to, ctx.today, ctx.timezone),
                    };
                });
            }),
    }),
});
