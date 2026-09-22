import { tool } from "ai";
import { z } from "zod";
import { and, between, eq, or } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tasks, habits } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import {
    normalizeStartBoundary,
    normalizeEndBoundary,
} from "@cadence/domain/task-temporal";
import { taskLocalDay, toMinimalTask } from "./projections";
import { addDaysToDateStr, toLocalDateStr } from "../../../platform/date-utils";

/** Hard cap on the span a single schedule-window read may cover. */
const MAX_RANGE_DAYS = 62;

export const calendarTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_schedule_window: tool({
        description:
            "READ-ONLY. Fetch tasks (by scheduled/due date) plus active habits within a date range " +
            "for density-aware planning. The range is capped at ~2 months and the task count is " +
            "hard-capped server-side. Pass the user's local dates (YYYY-MM-DD); both ends are inclusive.",
        inputSchema: z.object({
            start: z.string().describe("First local date, YYYY-MM-DD (a datetime is reduced to its local date)."),
            end: z.string().describe("Last local date, YYYY-MM-DD (inclusive)."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(50)
                .describe("Max tasks returned (capped at 50)."),
        }),
        execute: async ({ start, end, limit }) =>
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
                            projectId: tasks.projectId,
                            waitingOn: tasks.waitingOn,
                        })
                        .from(tasks)
                        .where(
                            and(
                                eq(tasks.userId, userId),
                                or(
                                    between(tasks.scheduledStart, startIso, endIso),
                                    between(tasks.dueDate, startIso, endIso),
                                ),
                            ),
                        )
                        .orderBy(tasks.scheduledStart)
                        .limit(cap);

                    const habitRows = await tx
                        .select({
                            id: habits.id,
                            title: habits.title,
                            recurrenceRule: habits.recurrenceRule,
                            targetTime: habits.targetTime,
                        })
                        .from(habits)
                        .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
                        .orderBy(habits.sortOrder)
                        .limit(50);

                    const inRange = taskRows.filter((row) => {
                        const day = taskLocalDay(row, ctx.timezone);
                        return day !== null && day >= from && day <= to;
                    });
                    return {
                        range: { start: from, end: to, timezone: ctx.timezone },
                        tasks: inRange.map((row) => toMinimalTask(row, ctx.timezone)),
                        habits: habitRows,
                    };
                });
            }),
    }),
});
