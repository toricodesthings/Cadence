import { tool } from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { habits, habitLogs } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { toMinimalHabit } from "./projections";
import { routinesDue } from "./calendar";

export const habitTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_habits: tool({
        description:
            "The user's routines (habits in code) with streaks and adherence (0..1). Archived ones only when asked.",
        inputSchema: z.object({
            includeArchived: z
                .boolean()
                .default(false)
                .describe("Also archived routines."),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ includeArchived, limit }) =>
            safeExecute("get_habits", userId, async () => {
                const cap = clampLimit(limit);
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({
                            id: habits.id,
                            title: habits.title,
                            recurrenceRule: habits.recurrenceRule,
                            currentStreak: habits.currentStreak,
                            longestStreak: habits.longestStreak,
                            totalCompletions: habits.totalCompletions,
                            totalSkips: habits.totalSkips,
                            archived: habits.archived,
                            pausedUntil: habits.pausedUntil,
                        })
                        .from(habits)
                        .where(
                            includeArchived
                                ? eq(habits.userId, userId)
                                : and(eq(habits.userId, userId), eq(habits.archived, false)),
                        )
                        .orderBy(habits.sortOrder)
                        .limit(cap + 1),
                );
                const more = rows.length > cap;
                return { habits: rows.slice(0, cap).map((r) => toMinimalHabit(r, ctx.today)), ...(more && { more }) };
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_habit_status_today: tool({
        description:
            "Today's status (COMPLETED, SKIPPED or PENDING) for each routine due today; paused ones are left out.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_habit_status_today", userId, async () => {
                const today = ctx.today;
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const rows = await tx
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

                    const logs = await tx
                        .select({ habitId: habitLogs.habitId, status: habitLogs.status })
                        .from(habitLogs)
                        .where(
                            and(eq(habitLogs.userId, userId), eq(habitLogs.targetDate, today)),
                        );
                    const active = routinesDue(rows, today, today);
                    const byHabit = new Map(logs.map((l) => [l.habitId, l.status]));

                    return {
                        date: today,
                        statuses: active.map((h) => ({
                            habitId: h.id,
                            title: h.title,
                            status: byHabit.get(h.id) ?? "PENDING",
                        })),
                    };
                });
            }),
    }),

    // ── P (proposal — NO DB WRITE) ──────────────────────────────────────────
    propose_log_habit: tool({
        description:
            "Drafts marking a routine done or skipped for a day (PENDING clears it).",
        inputSchema: z.object({
            habitId: z.string().uuid().describe("Habit to log."),
            status: z.enum(["COMPLETED", "SKIPPED", "PENDING"]).describe("Resolution to apply."),
            targetDate: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}/, "YYYY-MM-DD")
                .describe("Calendar day, YYYY-MM-DD."),
        }),
    }),
});
