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
import { toMinimalTask } from "./projections";

/** Hard cap on the span a single schedule-window read may cover. */
const MAX_RANGE_DAYS = 62;

export const calendarTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_schedule_window: tool({
        description:
            "READ-ONLY. Fetch tasks (by scheduled/due date) plus active habits within a date range " +
            "for density-aware planning. The range is capped at ~2 months and the task count is " +
            "hard-capped server-side. Dates are ISO-8601 (date or datetime).",
        inputSchema: z.object({
            start: z.string().describe("Range start, ISO-8601 (inclusive)."),
            end: z.string().describe("Range end, ISO-8601 (inclusive)."),
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
                const startIso = normalizeStartBoundary(start);
                let endIso = normalizeEndBoundary(end);

                // Clamp the span server-side so a huge range can't be requested.
                const startMs = Date.parse(startIso);
                const endMs = Date.parse(endIso);
                if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
                    const maxMs = startMs + MAX_RANGE_DAYS * 86_400_000;
                    if (endMs > maxMs) endIso = new Date(maxMs).toISOString();
                }
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
                            targetMode: habits.targetMode,
                        })
                        .from(habits)
                        .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
                        .orderBy(habits.sortOrder)
                        .limit(50);

                    return {
                        range: { start: startIso, end: endIso },
                        tasks: taskRows.map(toMinimalTask),
                        habits: habitRows,
                    };
                });
            }),
    }),
});
