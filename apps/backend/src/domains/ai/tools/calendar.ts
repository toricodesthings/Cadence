import { tool } from "ai";
import { z } from "zod";
import { and, between, eq, isNotNull, ne, or } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tasks, habits } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, MAX_LIST_LIMIT } from "./index";
import { normalizeStartBoundary, normalizeEndBoundary } from "@cadence/contracts/common";
import { expandScheduleScopedTasks } from "@cadence/domain/task-recurrence";
import { taskLocalDay, toMinimalTask } from "./projections";
import { expandOccurrences } from "../../habits/habits.service";
import { addDaysToDateStr, toLocalDateStr } from "../../../platform/date-utils";

/** Hard cap on the span a single schedule-window read may cover. */
const MAX_RANGE_DAYS = 62;

/** Routines with the days they're due in [from, to], skipping paused days; none due → left out. */
export function routinesDue(
    rows: { id: string; title: string; recurrenceRule: string; targetTime: string | null; createdAt: string; pausedUntil: string | null }[],
    from: string,
    to: string,
    timeZone = "UTC",
) {
    return rows.flatMap((row) => {
        const days = expandOccurrences(row.recurrenceRule, row.createdAt, new Date(`${from}T00:00:00.000Z`), new Date(`${to}T23:59:59.999Z`), timeZone)
            .filter((day) => !row.pausedUntil || day > row.pausedUntil);
        return days.length ? [{ id: row.id, title: row.title, days, targetTime: row.targetTime }] : [];
    });
}

export const calendarTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_schedule_window: tool({
        description:
            "Open tasks and the routines due on each day of a local date range (inclusive, up to ~2 months), " +
            "for planning. Repeating tasks appear once per occurrence. fixedBlock:true = a class or shift: it " +
            "takes that time, can't be checked off and is never overdue. more:true when the cap cut tasks off.",
        inputSchema: z.object({
            start: z.string().describe("First local date (a datetime is reduced to its local date)."),
            end: z.string().describe("Last local date."),
            includeDone: z.boolean().default(false).describe("Also tasks already done."),
            limit: z.number().int().min(1).max(50).default(50),
        }),
        execute: async ({ start, end, includeDone, limit }) =>
            safeExecute("get_schedule_window", userId, async () => {
                // Work in the user's local dates; a datetime is reduced to its local day.
                const localDay = (value: string) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toLocalDateStr(new Date(value), ctx.timezone);
                const from = localDay(start);
                let to = localDay(end);
                // Clamp the span server-side so a huge range can't be requested.
                const maxTo = addDaysToDateStr(from, MAX_RANGE_DAYS);
                if (to > maxTo) to = maxTo;
                // The DB filters by UTC day; query a day wider and keep exact local days below.
                const startIso = normalizeStartBoundary(addDaysToDateStr(from, -1));
                const endIso = normalizeEndBoundary(addDaysToDateStr(to, 1));
                const cap = clampLimit(limit, 50);

                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const taskRows = await tx
                        .select({
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
                            waitingOn: tasks.waitingOn,
                            interactionMode: tasks.interactionMode,
                            recurrenceRule: tasks.recurrenceRule,
                            orderIndex: tasks.orderIndex,
                            isPinned: tasks.isPinned,
                        })
                        .from(tasks)
                        .where(
                            and(
                                eq(tasks.userId, userId),
                                // Trash never, Done only when asked.
                                ne(tasks.state, "ARCHIVED"),
                                includeDone ? undefined : ne(tasks.state, "COMPLETE"),
                                or(
                                    between(tasks.scheduledStart, startIso, endIso),
                                    between(tasks.dueDate, startIso, endIso),
                                    // A repeating series is stored at its first date; expand below.
                                    isNotNull(tasks.recurrenceRule),
                                ),
                            ),
                        )
                        .orderBy(tasks.scheduledStart)
                        // ponytail: this row cap applies before expansion, so 50+ series/dated rows
                        // could crowd each other out. Page by date if that ever bites.
                        .limit(MAX_LIST_LIMIT);

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
                    const expanded = expandScheduleScopedTasks(taskRows, {
                        scheduledRangeStart: startIso,
                        scheduledRangeEnd: endIso,
                    });
                    const inRange = expanded.filter((row) => {
                        const day = taskLocalDay(row, ctx.timezone);
                        return day !== null && day >= from && day <= to;
                    });
                    return {
                        range: { start: from, end: to, timezone: ctx.timezone },
                        tasks: inRange.slice(0, cap).map((row) => toMinimalTask(row, ctx.timezone)),
                        more: inRange.length > cap || undefined,
                        routines: routinesDue(habitRows, from, to, ctx.timezone),
                    };
                });
            }),
    }),
});
