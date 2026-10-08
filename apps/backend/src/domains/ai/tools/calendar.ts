import { tool } from "ai";
import { z } from "zod";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tasks, habits } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { placeNameColumns } from "./tasks";
import { inDayWindow } from "../../tasks/task-filters";
import { expandScheduleScopedTasks, taskDay } from "@cadence/domain/task-recurrence";
import { isPausedOn } from "@cadence/domain/repeats";
import { addDays } from "@cadence/domain/time";
import { toMinimalTask } from "./projections";
import { expandOccurrences } from "../../habits/habits.service";

/** Hard cap on the span a single schedule-window read may cover. */
const MAX_RANGE_DAYS = 62;

/** The task columns a schedule window projects. */
const scheduleColumns = {
    ...placeNameColumns,
    id: tasks.id,
    title: tasks.title,
    state: tasks.state,
    dueDate: tasks.dueDate,
    endDate: tasks.endDate,
    zone: tasks.zone,
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
    rows: { id: string; title: string; recurrenceRule: string; targetTime: string | null; times?: string[] | null; createdAt: string; pausedUntil: string | null }[],
    from: string,
    to: string,
    today: string,
    timeZone = "UTC",
) {
    return rows.flatMap((row) => {
        const days = expandOccurrences(row.recurrenceRule, row.createdAt, from, to, timeZone)
            .filter((day) => !isPausedOn(row.pausedUntil, day, today));
        // A routine at set times reports them instead of one usual time.
        return days.length ? [{ id: row.id, title: row.title, days, ...(row.times?.length ? { times: row.times } : { targetTime: row.targetTime }) }] : [];
    });
}

/** Rows a window reads before expansion: plenty for ~2 months, a guard against runaway data. */
const WINDOW_ROW_GUARD = 500;

export const calendarTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_schedule_window: tool({
        description:
            "Open tasks and the routines due on each day of a local day range (inclusive, up to ~2 months), " +
            "for planning, sorted by day and time. Repeating tasks appear once per occurrence. fixedBlock:true = a class or shift: it " +
            "takes that time, can't be checked off and is never overdue. Tasks page with offset: more:true and nextOffset when there's more.",
        inputSchema: z.object({
            start: z.iso.date().describe("First local day, YYYY-MM-DD."),
            end: z.iso.date().describe("Last local day."),
            includeDone: z.boolean().default(false).describe("Also tasks already done."),
            offset: z.number().int().min(0).max(100_000).optional().describe("From nextOffset; omit for the first page."),
            limit: z.number().int().min(1).max(50).default(50),
        }),
        execute: async ({ start, end, includeDone, offset = 0, limit }) =>
            safeExecute("get_schedule_window", userId, async () => {
                const from = start;
                let to = end;
                // Clamp the span server-side so a huge range can't be requested.
                const maxTo = addDays(from, MAX_RANGE_DAYS);
                if (to > maxTo) to = maxTo;
                const cap = clampLimit(limit, 50);

                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const open = and(
                        eq(tasks.userId, userId),
                        // Trash never, Done only when asked.
                        ne(tasks.state, "ARCHIVED"),
                        includeDone ? undefined : ne(tasks.state, "COMPLETE"),
                    );
                    // Dated one-offs in the window: all-day on `due_on`, timed by the day's instant bounds.
                    const dated = await tx
                        .select(scheduleColumns)
                        .from(tasks)
                        .where(and(open, isNull(tasks.recurrenceRule), inDayWindow(from, to, ctx.timezone)))
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
                            times: habits.times,
                            createdAt: habits.createdAt,
                            pausedUntil: habits.pausedUntil,
                        })
                        .from(habits)
                        .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
                        .orderBy(habits.sortOrder)
                        .limit(50);

                    // Same expansion as GET /tasks for a day window: each occurrence of a
                    // repeating series lands on its own day, in the series' zone.
                    const expanded = expandScheduleScopedTasks(series, { from, to }, ctx.timezone);
                    const when = (row: (typeof dated)[number]) => `${taskDay(row, ctx.timezone)} ${row.scheduledStart ?? ""}`;
                    const inRange = [...dated.slice(0, WINDOW_ROW_GUARD), ...expanded].sort((a, b) => when(a).localeCompare(when(b)));
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
