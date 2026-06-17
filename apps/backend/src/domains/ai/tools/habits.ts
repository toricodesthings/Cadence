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

export const habitTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_habits: tool({
        description:
            "READ-ONLY. List the user's active habits with a streak/adherence summary " +
            "(currentStreak, longestStreak, adherence 0..1). Adherence is derived from the " +
            "habit's running completion/skip counts. Excludes archived habits by default.",
        inputSchema: z.object({
            includeArchived: z
                .boolean()
                .default(false)
                .describe("Include archived habits as well."),
            limit: z.number().int().min(1).max(50).default(20).describe("Max rows (capped at 50)."),
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
                            targetMode: habits.targetMode,
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
                        .limit(cap),
                );
                return { habits: rows.map((r) => toMinimalHabit(r, ctx.currentDate)) };
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_habit_status_today: tool({
        description:
            "READ-ONLY. Today's resolution status per habit (COMPLETED / SKIPPED / PENDING) for " +
            "the user's current local date. Habits with no log row today are reported PENDING.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_habit_status_today", userId, async () => {
                const today = ctx.currentDate.slice(0, 10);
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const active = await tx
                        .select({ id: habits.id, title: habits.title })
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
            "PROPOSAL ONLY — does NOT log anything. Proposes marking a habit COMPLETED/SKIPPED " +
            "(or clearing to PENDING) for a date; the log is written later via REST after " +
            "confirmation. targetDate is a YYYY-MM-DD calendar day.",
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
