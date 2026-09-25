import { tool } from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { habits, habitLogs } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, once } from "./index";
import { toMinimalHabit } from "./projections";
import { routinesDue } from "./calendar";
import { resolveHabit } from "../../habits/habits.service";
import { stepStatusSchema } from "@cadence/contracts/habit";
import { stepMarksOn } from "@cadence/domain/repeats";

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
                return { habits: rows.slice(0, cap).map((r) => toMinimalHabit(r, ctx.today)), more: rows.length > cap || undefined };
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_habit_status_today: tool({
        description:
            "Today's status (COMPLETED, SKIPPED or PENDING) for each routine due today, with each step's status for routines that have steps; paused ones are left out.",
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
                            steps: habits.steps,
                        })
                        .from(habits)
                        .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
                        .orderBy(habits.sortOrder)
                        .limit(50);

                    const logs = await tx
                        .select({ habitId: habitLogs.habitId, status: habitLogs.status, stepStatus: habitLogs.stepStatus })
                        .from(habitLogs)
                        .where(
                            and(eq(habitLogs.userId, userId), eq(habitLogs.targetDate, today)),
                        );
                    const active = routinesDue(rows, today, today, ctx.timezone);
                    const byHabit = new Map(logs.map((l) => [l.habitId, l]));
                    const stepsOf = new Map(rows.map((r) => [r.id, r.steps ?? []]));

                    return {
                        date: today,
                        statuses: active.map((h) => {
                            const log = byHabit.get(h.id);
                            const steps = stepsOf.get(h.id) ?? [];
                            const marks = stepMarksOn(steps.map((step) => step.id), log);
                            return {
                                habitId: h.id,
                                title: h.title,
                                status: log?.status ?? "PENDING",
                                steps: steps.length ? steps.map((step) => ({ id: step.id, title: step.title, status: marks[step.id] ?? "PENDING" })) : undefined,
                            };
                        }),
                    };
                });
            }),
    }),

    // ── W ──────────────────────────────────────────────────────────────────
    log_habit: tool({
        description: "Marks a routine done or skipped for a day (PENDING clears it), or, with `stepStatus`, the day's steps one by one: the day is done once every step is done or skipped. Returns the day's status and the routine's streak.",
        inputSchema: z.object({
            habitId: z.uuid(),
            status: z.enum(["COMPLETED", "SKIPPED", "PENDING"]).describe("The whole day. Ignored when stepStatus is sent."),
            targetDate: z.iso.date().describe("The local day."),
            stepStatus: stepStatusSchema.optional().describe("Step id → COMPLETED or SKIPPED, for every step settled that day; a step left out is open. Replaces the day's marks."),
        }),
        execute: async (input, { toolCallId }) =>
            safeExecute("log_habit", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const { habit, log } = await resolveHabit(tx, userId, input.habitId, { ...input, timezone: ctx.timezone });
                        return { result: { status: log.status, currentStreak: habit.currentStreak }, id: habit.id };
                    }),
                ),
            ),
    }),
});
