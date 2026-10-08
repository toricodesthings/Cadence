import { tool } from "ai";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { habits, habitLogs, habitTags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, once } from "./index";
import { toMinimalHabit } from "./projections";
import { routinesDue } from "./calendar";
import { createHabit, deleteHabit, habitDays, moveHabit, resolveHabit, updateHabit } from "../../habits/habits.service";
import { habitTargetTimesSchema, insertHabitSchema, MAX_ROUTINE_STEPS, routineStepSchema, routineTimesSchema, stepStatusSchema } from "@cadence/contracts/habit";
import { stepMarksOn, timeMarksOn } from "@cadence/domain/repeats";
import { addDays } from "@cadence/domain/time";
import type { Tx } from "../../../types/db";

const stepTitle = routineStepSchema.shape.title;
const routineFields = z.object({
    title: insertHabitSchema.shape.title,
    recurrenceRule: z
        .string()
        .regex(/^FREQ=(DAILY(;INTERVAL=[1-9]\d?)?|WEEKLY(;INTERVAL=2)?;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)$/)
        .describe("FREQ=DAILY · FREQ=DAILY;INTERVAL=2 (every 2nd day) · FREQ=WEEKLY;BYDAY=MO,WE,FR · FREQ=WEEKLY;INTERVAL=2;BYDAY=SA (every other week)."),
    targetTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe("Usual local time, HH:MM 24h; null = any time."),
    emoji: insertHabitSchema.shape.emoji.describe("One emoji as its mark, or null for none."),
    description: z.string().max(2_000).nullable().optional().describe("Its purpose, a line or two."),
    reminderEnabled: z.boolean().optional().describe("Remind on due days while still open."),
    colorAccent: z.string().max(40).optional().describe("Colour token, e.g. 'lantern'."),
    dayTimes: habitTargetTimesSchema.nullable().optional()
        .describe("Weekday (MO..SU) → HH:MM where a day differs from targetTime; \"\" = any time that day; null = the same every day."),
    times: routineTimesSchema.nullable().optional().describe("Several set times each day, HH:MM 24h (medication at 08:00, 14:00, 20:00); each is checked off on its own. Replaces targetTime and dayTimes; null = back to one usual time."),
    projectId: z.uuid().nullable().optional().describe("A list it belongs to; null = none."),
    tagIds: z.array(z.uuid()).max(20).optional().describe("Its tags (replaces them on change)."),
});

/** Hard cap on the span one history read covers. */
const MAX_HISTORY_DAYS = 62;

type DayStatus = "done" | "skipped" | "missed" | "partial" | "open";

/**
 * Each routine's due days in [from, to] with how each went, the way Routines
 * shows them (`habitDays`): done, skipped, missed (due, nothing logged, before
 * today), partial (some steps or times settled, the day not), or open (today, not yet).
 */
async function routineDays(
    tx: Tx,
    userId: string,
    rows: { id: string; recurrenceRule: string; createdAt: string; pausedUntil: string | null }[],
    from: string,
    to: string,
    timeZone: string,
    today: string,
) {
    const logs = rows.length
        ? await tx
              .select({ habitId: habitLogs.habitId, targetDate: habitLogs.targetDate, status: habitLogs.status, stepStatus: habitLogs.stepStatus, timeMarks: habitLogs.timeMarks })
              .from(habitLogs)
              .where(and(eq(habitLogs.userId, userId), inArray(habitLogs.habitId, rows.map((row) => row.id)), gte(habitLogs.targetDate, from), lte(habitLogs.targetDate, to)))
        : [];
    const byHabit = new Map<string, Map<string, (typeof logs)[number]>>();
    for (const log of logs) {
        if (!byHabit.has(log.habitId)) byHabit.set(log.habitId, new Map());
        byHabit.get(log.habitId)!.set(log.targetDate, log);
    }
    return new Map(rows.map((row) => [row.id, habitDays(row, byHabit.get(row.id) ?? new Map(), from, to, timeZone, today).map(({ date, log }) => {
        const status: DayStatus = log?.status === "COMPLETED" ? "done"
            : log?.status === "SKIPPED" ? "skipped"
                : date >= today ? "open"
                    : Object.keys(log?.stepStatus ?? log?.timeMarks ?? {}).length ? "partial" : "missed";
        return { date, status };
    })]));
}

/** The routine columns the read projects. */
const routineColumns = {
    id: habits.id,
    title: habits.title,
    emoji: habits.emoji,
    recurrenceRule: habits.recurrenceRule,
    targetTime: habits.targetTime,
    targetTimes: habits.targetTimes,
    colorAccent: habits.colorAccent,
    projectId: habits.projectId,
    steps: habits.steps,
    times: habits.times,
    currentStreak: habits.currentStreak,
    longestStreak: habits.longestStreak,
    archived: habits.archived,
    pausedUntil: habits.pausedUntil,
    createdAt: habits.createdAt,
} as const;

export const habitTools = (env: Env, userId: string, ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_habits: tool({
        description:
            "The user's routines (habits in code) in their Routines order, with emoji, usual time, day times, steps, streaks, " +
            "adherence (share of the last 30 days' due days done, 0..1) and missedLast30. Which days were missed: get_habit_history. " +
            "Archived ones only when asked. more:true and nextOffset when there's more.",
        inputSchema: z.object({
            includeArchived: z
                .boolean()
                .default(false)
                .describe("Also archived routines."),
            offset: z.number().int().min(0).max(100_000).optional().describe("From nextOffset; omit for the first page."),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ includeArchived, offset = 0, limit }) =>
            safeExecute("get_habits", userId, async () => {
                const cap = clampLimit(limit);
                const db = getDbClient(env);
                const { rows, links, recent } = await withRls(db, userId, async (tx) => {
                    const rows = await tx
                        .select(routineColumns)
                        .from(habits)
                        .where(
                            includeArchived
                                ? eq(habits.userId, userId)
                                : and(eq(habits.userId, userId), eq(habits.archived, false)),
                        )
                        .orderBy(habits.sortOrder, habits.createdAt, habits.id)
                        .limit(cap + 1)
                        .offset(offset);
                    const ids = rows.slice(0, cap).map((row) => row.id);
                    const links = ids.length
                        ? await tx.select({ habitId: habitTags.habitId, tagId: habitTags.tagId }).from(habitTags).where(inArray(habitTags.habitId, ids))
                        : [];
                    const recent = await routineDays(tx, userId, rows.slice(0, cap), addDays(ctx.today, -30), addDays(ctx.today, -1), ctx.timezone, ctx.today);
                    return { rows, links, recent };
                });
                const count = (id: string, status: DayStatus) => recent.get(id)?.filter((day) => day.status === status).length ?? 0;
                const more = rows.length > cap;
                return {
                    habits: rows.slice(0, cap).map((r) => toMinimalHabit(
                        { ...r, tagIds: links.filter((l) => l.habitId === r.id).map((l) => l.tagId) },
                        ctx.today,
                        { done: count(r.id, "done"), missed: count(r.id, "missed") + count(r.id, "partial") },
                    )),
                    ...(more && { more, nextOffset: offset + cap }),
                };
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_habit_status_today: tool({
        description:
            "Today's status (COMPLETED, SKIPPED or PENDING) for each routine due today, with each step's status for routines that have steps and each time's for routines at set times; paused ones are left out.",
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
                            times: habits.times,
                        })
                        .from(habits)
                        .where(and(eq(habits.userId, userId), eq(habits.archived, false)))
                        .orderBy(habits.sortOrder)
                        .limit(50);

                    const logs = await tx
                        .select({ habitId: habitLogs.habitId, status: habitLogs.status, stepStatus: habitLogs.stepStatus, timeMarks: habitLogs.timeMarks })
                        .from(habitLogs)
                        .where(
                            and(eq(habitLogs.userId, userId), eq(habitLogs.targetDate, today)),
                        );
                    const active = routinesDue(rows, today, today, today, ctx.timezone);
                    const byHabit = new Map(logs.map((l) => [l.habitId, l]));
                    const stepsOf = new Map(rows.map((r) => [r.id, r.steps ?? []]));
                    const timesOf = new Map(rows.map((r) => [r.id, r.times ?? []]));

                    return {
                        date: today,
                        statuses: active.map((h) => {
                            const log = byHabit.get(h.id);
                            const steps = stepsOf.get(h.id) ?? [];
                            const marks = stepMarksOn(steps.map((step) => step.id), log);
                            const times = timesOf.get(h.id) ?? [];
                            const timeMarks = timeMarksOn(times, log);
                            return {
                                habitId: h.id,
                                title: h.title,
                                status: log?.status ?? "PENDING",
                                steps: steps.length ? steps.map((step) => ({ id: step.id, title: step.title, status: marks[step.id] ?? "PENDING" })) : undefined,
                                times: times.length ? times.map((time) => ({ time, status: timeMarks[time]?.status ?? "PENDING" })) : undefined,
                            };
                        }),
                    };
                });
            }),
    }),

    // ── R ──────────────────────────────────────────────────────────────────
    get_habit_history: tool({
        description:
            "How each routine went on its due days in a local date range (inclusive, through today, up to ~2 months): dates done, " +
            "skipped, missed (due, nothing logged), partial (some steps or times settled) and open (today, not logged yet). " +
            "Paused days and days before a routine existed aren't due. Archived routines only when asked.",
        inputSchema: z.object({
            start: z.iso.date().describe("First local day."),
            end: z.iso.date().describe("Last local day; later than today reads through today."),
            habitId: z.uuid().optional().describe("One routine only."),
            includeArchived: z.boolean().default(false),
        }),
        execute: async ({ start, end, habitId, includeArchived }) =>
            safeExecute("get_habit_history", userId, async () => {
                const to = [end, ctx.today, addDays(start, MAX_HISTORY_DAYS)].sort()[0];
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const rows = await tx
                        .select({ id: habits.id, title: habits.title, recurrenceRule: habits.recurrenceRule, createdAt: habits.createdAt, pausedUntil: habits.pausedUntil })
                        .from(habits)
                        .where(and(
                            eq(habits.userId, userId),
                            habitId ? eq(habits.id, habitId) : undefined,
                            includeArchived || habitId ? undefined : eq(habits.archived, false),
                        ))
                        .orderBy(habits.sortOrder, habits.createdAt)
                        .limit(50);
                    const days = await routineDays(tx, userId, rows, start, to, ctx.timezone, ctx.today);
                    return {
                        range: { start, end: to },
                        routines: rows.map((row) => {
                            const list = days.get(row.id) ?? [];
                            const on = (status: DayStatus) => {
                                const dates = list.filter((day) => day.status === status).map((day) => day.date);
                                return dates.length ? dates : undefined;
                            };
                            return {
                                habitId: row.id,
                                title: row.title,
                                due: list.length,
                                done: on("done"),
                                skipped: on("skipped"),
                                missed: on("missed"),
                                partial: on("partial"),
                                open: on("open"),
                            };
                        }),
                    };
                });
            }),
    }),

    // ── W ──────────────────────────────────────────────────────────────────
    log_habit: tool({
        description: "Marks a routine done or skipped for a day (PENDING clears it), or, with `stepStatus`, the day's steps one by one: the day is done once every step is done or skipped. A routine at set times is marked one `time` at a time. Returns the day's status and the routine's streak.",
        inputSchema: z.object({
            habitId: z.uuid(),
            status: z.enum(["COMPLETED", "SKIPPED", "PENDING"]).describe("The whole day. Ignored when stepStatus is sent."),
            targetDate: z.iso.date().describe("The local day."),
            time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("A routine at set times: the HH:MM to mark; only that time changes (status PENDING clears it). Required to mark such a routine."),
            stepStatus: stepStatusSchema.optional().describe("Step id → COMPLETED or SKIPPED, for every step settled that day; a step left out is open. Replaces the day's marks."),
        }),
        execute: async (input, { toolCallId }) =>
            safeExecute("log_habit", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const { habit, log } = await resolveHabit(tx, userId, input.habitId, input);
                        return { result: { status: log.status, currentStreak: habit.currentStreak }, id: habit.id };
                    }),
                ),
            ),
    }),

    // ── W ──────────────────────────────────────────────────────────────────
    create_habit: tool({
        description: "Creates a routine on Routines. Returns its habitId.",
        inputSchema: routineFields.extend({ steps: z.array(stepTitle).max(MAX_ROUTINE_STEPS).optional().describe("Steps in order, for a routine done as a short sequence.") }),
        execute: async ({ steps, dayTimes, ...input }, { toolCallId }) =>
            safeExecute("create_habit", userId, async () => {
                const row = await withRls(getDbClient(env), userId, (tx) =>
                    createHabit(tx, userId, {
                        ...input,
                        ...(dayTimes !== undefined && { targetTimes: dayTimes }),
                        steps: steps?.length ? steps.map((title) => ({ id: crypto.randomUUID(), title })) : undefined,
                    }, toolCallId));
                return { habitId: row.id, title: row.title };
            }),
    }),

    // ── U ──────────────────────────────────────────────────────────────────
    update_habit: tool({
        description: "Changes a routine: any of its fields, its steps (the full new list), pause, archive, or its place in Routines. Send only what changes.",
        inputSchema: z.object({
            habitId: z.uuid(),
            patch: routineFields.partial().extend({
                steps: z.array(z.object({ id: z.string().max(64).optional().describe("An existing step's id, to keep its history."), title: stepTitle }))
                    .max(MAX_ROUTINE_STEPS).nullable().optional().describe("Replaces every step, in order; null or [] removes them."),
                pausedUntil: z.iso.date().nullable().optional().describe("Paused from today through this local day; null resumes."),
                archived: z.boolean().optional().describe("true puts it away (restorable), false restores it."),
                position: z.number().int().min(1).optional().describe("Its place in Routines (1 = first); past the end = last."),
            }),
        }),
        execute: async ({ habitId, patch: { steps, dayTimes, position, ...patch } }, { toolCallId }) =>
            safeExecute("update_habit", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const row = await updateHabit(tx, userId, habitId, {
                            ...patch,
                            ...(dayTimes !== undefined && { targetTimes: dayTimes }),
                            ...(steps !== undefined && { steps: steps?.length ? steps.map((step) => ({ id: step.id ?? crypto.randomUUID(), title: step.title })) : null }),
                        });
                        if (position !== undefined) await moveHabit(tx, userId, habitId, position);
                        return { result: { habitId: row.id, title: row.title }, id: row.id };
                    }),
                ),
            ),
    }),

    // ── D ──────────────────────────────────────────────────────────────────
    delete_habit: tool({
        description: "Deletes a routine for good, with its whole history and streaks (can't be undone; archive is the restorable way). Echo the title.",
        inputSchema: z.object({ habitId: z.uuid(), title: z.string().max(255) }),
        execute: async ({ habitId }, { toolCallId }) =>
            safeExecute("delete_habit", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const row = await deleteHabit(tx, userId, habitId);
                        return { result: { deleted: row.title }, id: userId };
                    }),
                ),
            ),
    }),
});
