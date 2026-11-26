import { tool } from "ai";
import { ACCENT_COLORS } from "@cadence/contracts/constants";
import { localDateSchema, wallTimeSchema } from "@cadence/contracts/common";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { habitLogs, habitTags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, once } from "./index";
import { toMinimalHabit } from "./projections";
import { offsetSchema } from "./drafts";
import { readSnapshotRoutines, routinesDue, type SnapshotRoutineReader } from "./routine-reads";
import { habitDays } from "@cadence/domain/repeats";
import { AppError } from "../../../platform/errors";
import { requireOwner, routineAccess } from "../../../platform/list-access";
import { broadcastLive } from "../../push/reminder-clock";
import { routinePeople, routinePersonNames } from "../../sharing/sharing.service";
import {
    createHabit,
    deleteHabit,
    loadHabitsForCaller,
    moveHabit,
    resolveHabit,
    setRoutineMemberPrefs,
    updateHabit,
    type ResolvedHabitRow,
} from "../../habits/habits.service";
import {
    habitTargetTimesSchema,
    insertHabitSchema,
    MAX_ROUTINE_STEPS,
    routineStepSchema,
    routineTimesSchema,
    stepStatusSchema,
} from "@cadence/contracts/habit";
import { stepMarksOn, timeMarksOn } from "@cadence/domain/repeats";
import { addDays, type LocalDate, type Zone } from "@cadence/domain/time";
import type { Tx } from "../../../types/db";

const stepTitle = routineStepSchema.shape.title;
const routineFields = z.object({
    title: insertHabitSchema.shape.title,
    recurrenceRule: z
        .string()
        .regex(
            /^FREQ=(DAILY(;INTERVAL=[1-9]\d?)?|WEEKLY(;INTERVAL=2)?;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)$/,
        )
        .describe(
            "FREQ=DAILY · FREQ=DAILY;INTERVAL=2 (every 2nd day) · FREQ=WEEKLY;BYDAY=MO,WE,FR · FREQ=WEEKLY;INTERVAL=2;BYDAY=SA (every other week).",
        ),
    targetTime: wallTimeSchema.nullable().optional().describe("Usual local time, HH:MM 24h; null = any time."),
    emoji: insertHabitSchema.shape.emoji.describe("One emoji as its mark, or null for none."),
    description: z.string().max(2_000).nullable().optional().describe("Its purpose, a line or two."),
    reminderEnabled: z.boolean().optional().describe("Remind on due days while still open."),
    colorAccent: z
        .enum(["lantern", ...ACCENT_COLORS])
        .optional()
        .describe("lantern = the default."),
    dayTimes: habitTargetTimesSchema
        .nullable()
        .optional()
        .describe(
            'Weekday (MO..SU) → HH:MM where a day differs from targetTime; "" = any time that day; null = the same every day.',
        ),
    times: routineTimesSchema
        .nullable()
        .optional()
        .describe(
            "Several set times each day, HH:MM 24h (medication at 08:00, 14:00, 20:00); each is checked off on its own. Replaces targetTime and dayTimes; null = back to one usual time.",
        ),
    projectId: z.uuid().nullable().optional().describe("A list it belongs to; null = none."),
    tagIds: z.array(z.uuid()).max(20).optional().describe("Its tags (replaces them on change)."),
});

const MAX_HISTORY_DAYS = 62;

type DayStatus = "done" | "skipped" | "missed" | "partial" | "open";

async function routineDays(
    tx: Tx,
    userId: string,
    rows: Pick<ResolvedHabitRow, "id" | "recurrenceRule" | "createdAt" | "pausedUntil" | "access" | "shareMode">[],
    from: string,
    to: string,
    timeZone: string,
    today: string,
) {
    const logs = rows.length
        ? await tx
              .select({
                  habitId: habitLogs.habitId,
                  userId: habitLogs.userId,
                  targetDate: habitLogs.targetDate,
                  status: habitLogs.status,
                  stepStatus: habitLogs.stepStatus,
                  timeMarks: habitLogs.timeMarks,
              })
              .from(habitLogs)
              .where(
                  and(
                      inArray(
                          habitLogs.habitId,
                          rows.map((row) => row.id),
                      ),
                      gte(habitLogs.targetDate, from),
                      lte(habitLogs.targetDate, to),
                  ),
              )
        : [];
    const byHabit = new Map<string, Map<string, (typeof logs)[number][]>>();
    for (const log of logs) {
        if (!byHabit.has(log.habitId)) byHabit.set(log.habitId, new Map());
        const byDate = byHabit.get(log.habitId)!;
        const list = byDate.get(log.targetDate) ?? [];
        list.push(log);
        byDate.set(log.targetDate, list);
    }
    return new Map(
        rows.map((row) => {
            const rawByDate = byHabit.get(row.id) ?? new Map<string, (typeof logs)[number][]>();
            const picked = new Map<string, (typeof logs)[number]>();
            for (const [dateKey, list] of rawByDate) {
                if (row.access === "view") {
                    const done = list.find((l) => l.status === "COMPLETED");
                    if (done) picked.set(dateKey, done);
                } else if (row.shareMode === "turns") {
                    const resolved =
                        list.find((l) => l.userId === userId) ??
                        list.find((l) => l.status === "COMPLETED" || l.status === "SKIPPED");
                    if (resolved) picked.set(dateKey, resolved);
                } else {
                    const mine = list.find((l) => l.userId === userId);
                    if (mine) picked.set(dateKey, mine);
                }
            }
            return [
                row.id,
                habitDays(row, picked, from, to, timeZone, today).map(({ date, log }) => {
                    if (row.access === "view") {
                        return { date, status: (log?.status === "COMPLETED" ? "done" : "open") as DayStatus };
                    }
                    const status: DayStatus =
                        log?.status === "COMPLETED"
                            ? "done"
                            : log?.status === "SKIPPED"
                              ? "skipped"
                              : date >= today
                                ? "open"
                                : Object.keys(log?.stepStatus ?? log?.timeMarks ?? {}).length
                                  ? "partial"
                                  : "missed";
                    return { date, status };
                }),
            ];
        }),
    );
}

function shareMeta(row: ResolvedHabitRow, turn?: string) {
    const isShared = row.access !== "owner" || row.members.length > 0;
    if (!isShared) return {};
    const way = row.access === "view" ? "cheering" : (row.shareMode ?? "together");
    return { shared: true, way, ...(turn ? { turn } : {}) };
}

export const habitTools = (env: Env, userId: string, ctx: AgentContext, readRoutines?: SnapshotRoutineReader) => ({
    get_habits: tool({
        description:
            "The user's routines (habits in code) in their Routines order, with emoji, usual time, day times or set times, steps, streaks, " +
            "adherence (share of the last 30 days' due days done, 0..1) and missedLast30. Which days were missed: get_habit_history. " +
            "Archived ones only when asked. more:true and nextOffset when there's more.",
        inputSchema: z.object({
            includeArchived: z.boolean().default(false).describe("Also archived routines."),
            offset: offsetSchema,
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ includeArchived, offset = 0, limit }) =>
            safeExecute("get_habits", userId, async () => {
                const cap = clampLimit(limit);
                const db = getDbClient(env);
                const { rows, live, links, recent, turns } = await withRls(db, userId, async (tx) => {
                    const { rows: all } = await loadHabitsForCaller(tx, userId, {
                        archived: includeArchived ? undefined : false,
                        zone: ctx.timezone as Zone,
                        today: ctx.today as LocalDate,
                    });
                    const sliced = all.slice(offset, offset + cap + 1);
                    const live = sliced.slice(0, cap);
                    const ids = live.map((row) => row.id);
                    const links = ids.length
                        ? await tx
                              .select({ habitId: habitTags.habitId, tagId: habitTags.tagId })
                              .from(habitTags)
                              .where(and(eq(habitTags.userId, userId), inArray(habitTags.habitId, ids)))
                        : [];
                    const recent = await routineDays(
                        tx,
                        userId,
                        live,
                        addDays(ctx.today, -30),
                        addDays(ctx.today, -1),
                        ctx.timezone,
                        ctx.today,
                    );
                    const otherHolderIds = [
                        ...new Set(
                            live
                                .map((row) =>
                                    row.shareMode === "turns" && row.today.turn && row.today.turn !== userId
                                        ? row.today.turn
                                        : null,
                                )
                                .filter((id): id is string => Boolean(id)),
                        ),
                    ];
                    const holderNames = await routinePersonNames(tx, otherHolderIds);
                    const turns = new Map<string, string>();
                    for (const row of live) {
                        if (row.shareMode !== "turns" || !row.today.turn) continue;
                        turns.set(
                            row.id,
                            row.today.turn === userId ? "you" : (holderNames.get(row.today.turn) ?? "someone"),
                        );
                    }
                    return { rows: sliced, live, links, recent, turns };
                });
                const count = (id: string, status: DayStatus) =>
                    recent.get(id)?.filter((day) => day.status === status).length ?? 0;
                const more = rows.length > cap;
                return {
                    habits: live.map((r) => ({
                        ...toMinimalHabit(
                            {
                                ...r,
                                tagIds:
                                    r.access === "owner"
                                        ? links.filter((l) => l.habitId === r.id).map((l) => l.tagId)
                                        : [],
                            },
                            ctx.today,
                            r.access === "view"
                                ? undefined
                                : { done: count(r.id, "done"), missed: count(r.id, "missed") + count(r.id, "partial") },
                        ),
                        ...shareMeta(r, turns.get(r.id)),
                    })),
                    ...(more && { more, nextOffset: offset + cap }),
                };
            }),
    }),

    get_habit_status_today: tool({
        description:
            "Today's status (COMPLETED, SKIPPED or PENDING) for each routine due today, with each step's status for routines that have steps and each time's for routines at set times; paused ones are left out.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_habit_status_today", userId, async () => {
                const today = ctx.today;
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const rows = await (readRoutines
                        ? readRoutines(tx)
                        : readSnapshotRoutines(tx, userId, ctx.timezone as Zone));
                    const active = routinesDue(rows, today, today, today, ctx.timezone);
                    const activeIds = active.map((h) => h.id);
                    const logs = activeIds.length
                        ? await tx
                              .select({
                                  habitId: habitLogs.habitId,
                                  userId: habitLogs.userId,
                                  status: habitLogs.status,
                                  stepStatus: habitLogs.stepStatus,
                                  timeMarks: habitLogs.timeMarks,
                              })
                              .from(habitLogs)
                              .where(and(inArray(habitLogs.habitId, activeIds), eq(habitLogs.targetDate, today)))
                        : [];
                    const modeOf = new Map(rows.map((r) => [r.id, r.shareMode]));
                    const byHabit = new Map<string, (typeof logs)[number]>();
                    for (const log of logs) {
                        const isTurns = modeOf.get(log.habitId) === "turns";
                        if (!isTurns && log.userId !== userId) continue;
                        const existing = byHabit.get(log.habitId);
                        if (
                            !existing ||
                            log.userId === userId ||
                            log.status === "COMPLETED" ||
                            log.status === "SKIPPED"
                        ) {
                            byHabit.set(log.habitId, log);
                        }
                    }
                    const stepsOf = new Map(rows.map((r) => [r.id, r.steps ?? []]));
                    const timesOf = new Map(rows.map((r) => [r.id, r.times ?? []]));

                    return {
                        date: today,
                        statuses: active.map((h) => {
                            const log = byHabit.get(h.id);
                            const steps = stepsOf.get(h.id) ?? [];
                            const marks = stepMarksOn(
                                steps.map((step) => step.id),
                                log,
                            );
                            const times = timesOf.get(h.id) ?? [];
                            const timeMarks = timeMarksOn(times, log);
                            return {
                                habitId: h.id,
                                title: h.title,
                                status: log?.status ?? "PENDING",
                                steps: steps.length
                                    ? steps.map((step) => ({
                                          id: step.id,
                                          title: step.title,
                                          status: marks[step.id] ?? "PENDING",
                                      }))
                                    : undefined,
                                times: times.length
                                    ? times.map((time) => ({ time, status: timeMarks[time]?.status ?? "PENDING" }))
                                    : undefined,
                            };
                        }),
                    };
                });
            }),
    }),

    get_habit_history: tool({
        description:
            "How each routine went on its due days in a local date range (inclusive, through today, up to ~2 months): dates done, " +
            "skipped, missed (due, nothing logged), partial (some steps or times settled) and open (today, not logged yet). " +
            "Paused days and days before a routine existed aren't due. Archived routines only when asked.",
        inputSchema: z.object({
            start: localDateSchema.describe("First local day."),
            end: localDateSchema.describe("Last local day; later than today reads through today."),
            habitId: z.uuid().optional().describe("One routine only."),
            includeArchived: z.boolean().default(false),
        }),
        execute: async ({ start, end, habitId, includeArchived }) =>
            safeExecute("get_habit_history", userId, async () => {
                const to = [end, ctx.today, addDays(start, MAX_HISTORY_DAYS)].sort()[0];
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const { rows: loaded } = await loadHabitsForCaller(tx, userId, {
                        archived: includeArchived || habitId ? undefined : false,
                        habitId,
                        zone: ctx.timezone as Zone,
                    });
                    const rows = loaded.slice(0, 50);
                    const days = await routineDays(tx, userId, rows, start, to, ctx.timezone, ctx.today);
                    return {
                        range: { start, end: to },
                        routines: rows.map((row) => {
                            const list = days.get(row.id) ?? [];
                            const on = (status: DayStatus) => {
                                const dates = list.filter((day) => day.status === status).map((day) => day.date);
                                return dates.length ? dates : undefined;
                            };
                            if (row.access === "view") {
                                return {
                                    habitId: row.id,
                                    title: row.title,
                                    ...shareMeta(row),
                                    done: on("done"),
                                };
                            }
                            return {
                                habitId: row.id,
                                title: row.title,
                                ...shareMeta(row),
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

    log_habit: tool({
        description:
            "Marks a routine done or skipped for a day (PENDING clears it), or, with `stepStatus`, the day's steps one by one: the day is done once every step is done or skipped. A routine at set times is marked one `time` at a time: send the time they mean; with none, COMPLETED takes the open time within 90 minutes of now (today) or the only one left, else it fails naming the open times: ask which. The result lists each time. Returns the day's status and the routine's streak.",
        inputSchema: z.object({
            habitId: z.uuid(),
            status: z
                .enum(["COMPLETED", "SKIPPED", "PENDING"])
                .describe("The whole day. Ignored when stepStatus is sent."),
            targetDate: localDateSchema.describe("The local day."),
            time: wallTimeSchema
                .optional()
                .describe(
                    "A routine at set times: the HH:MM to mark; only that time changes (PENDING clears it). Required to skip.",
                ),
            stepStatus: stepStatusSchema
                .optional()
                .describe(
                    "Step id → COMPLETED or SKIPPED, for every step settled that day; a step left out is open. Replaces the day's marks.",
                ),
        }),
        execute: async (input, { toolCallId }) =>
            safeExecute("log_habit", userId, async () => {
                let audience: string[] | undefined;
                const result = await withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const access = await routineAccess(tx, userId, input.habitId);
                        if (access.role === "view") {
                            const people = await routinePeople(tx, input.habitId);
                            const ownerName = people.find((p) => p.role === "owner")?.name ?? "the owner";
                            throw new AppError(
                                403,
                                "VIEW_ONLY",
                                `You're cheering this one on; only ${ownerName} checks it off.`,
                            );
                        }
                        audience = access.audience;
                        const { habit, log } = await resolveHabit(tx, userId, input.habitId, {
                            ...input,
                            at: ctx.currentDate,
                        });
                        const times = habit.times ?? [];
                        const marks = timeMarksOn(times, log);
                        return {
                            result: {
                                status: log.status,
                                currentStreak: habit.currentStreak,
                                times: times.length
                                    ? times.map((time) => ({ time, status: marks[time]?.status ?? "PENDING" }))
                                    : undefined,
                            },
                            id: habit.id,
                        };
                    }),
                );
                if (audience && audience.length > 1 && !(result as { deduped?: boolean }).deduped) {
                    ctx.waitUntil?.(broadcastLive(env, userId, audience, [{ type: "routine" }]));
                }
                return result;
            }),
    }),

    create_habit: tool({
        description:
            "Creates a routine: done or skipped per day, never overdue (gym, reading). Something still owed when missed (rent) is a task with recurrenceRule; a class or shift is a task with fixed:true. Returns its habitId.",
        inputSchema: routineFields.extend({
            steps: z
                .array(stepTitle)
                .max(MAX_ROUTINE_STEPS)
                .optional()
                .describe("Steps in order, for a routine done as a short sequence."),
        }),
        execute: async ({ steps, dayTimes, ...input }, { toolCallId }) =>
            safeExecute("create_habit", userId, async () => {
                const row = await withRls(getDbClient(env), userId, (tx) =>
                    createHabit(
                        tx,
                        userId,
                        {
                            ...input,
                            ...(dayTimes !== undefined && { targetTimes: dayTimes }),
                            steps: steps?.length
                                ? steps.map((title) => ({ id: crypto.randomUUID(), title }))
                                : undefined,
                        },
                        toolCallId,
                    ),
                );
                return { habitId: row.id, title: row.title };
            }),
    }),

    update_habit: tool({
        description:
            "Changes a routine: any of its fields, its steps (the full new list), pause, archive, or its place in Routines. Send only what changes.",
        inputSchema: z.object({
            habitId: z.uuid(),
            patch: routineFields.partial().extend({
                steps: z
                    .array(
                        z.object({
                            id: z.string().max(64).optional().describe("An existing step's id, to keep its history."),
                            title: stepTitle,
                        }),
                    )
                    .max(MAX_ROUTINE_STEPS)
                    .nullable()
                    .optional()
                    .describe("Replaces every step, in order; null or [] removes them."),
                pausedUntil: z.iso
                    .date()
                    .nullable()
                    .optional()
                    .describe("Paused from today through this local day; null resumes."),
                archived: z.boolean().optional().describe("true puts it away (restorable), false restores it."),
                position: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("Its place in Routines (1 = first); past the end = last."),
            }),
        }),
        execute: async ({ habitId, patch: { steps, dayTimes, position, ...patch } }, { toolCallId }) =>
            safeExecute("update_habit", userId, async () => {
                let audience: string[] | undefined;
                const result = await withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const access = await routineAccess(tx, userId, habitId);
                        if (access.role === "view") {
                            throw new AppError(403, "VIEW_ONLY", "You're cheering this one on; you can't edit it.");
                        }
                        audience = access.audience;
                        if (access.role !== "owner") {
                            if (
                                patch.archived !== undefined ||
                                patch.projectId !== undefined ||
                                patch.tagIds !== undefined
                            ) {
                                requireOwner(access, "routine");
                            }
                            const { reminderEnabled, pausedUntil, ...defPatch } = patch;
                            if (reminderEnabled !== undefined || pausedUntil !== undefined) {
                                await setRoutineMemberPrefs(tx, habitId, { reminderEnabled, pausedUntil });
                            }
                            const body = {
                                ...defPatch,
                                ...(dayTimes !== undefined && { targetTimes: dayTimes }),
                                ...(steps !== undefined && {
                                    steps: steps?.length
                                        ? steps.map((step) => ({
                                              id: step.id ?? crypto.randomUUID(),
                                              title: step.title,
                                          }))
                                        : null,
                                }),
                            };
                            if (Object.keys(body).length > 0) {
                                await updateHabit(tx, access.ownerId, habitId, body, userId);
                            }
                            const { rows } = await loadHabitsForCaller(tx, userId, { habitId });
                            return { result: { habitId, title: rows[0]?.title ?? "" }, id: habitId };
                        }
                        const row = await updateHabit(tx, userId, habitId, {
                            ...patch,
                            ...(dayTimes !== undefined && { targetTimes: dayTimes }),
                            ...(steps !== undefined && {
                                steps: steps?.length
                                    ? steps.map((step) => ({ id: step.id ?? crypto.randomUUID(), title: step.title }))
                                    : null,
                            }),
                        });
                        if (position !== undefined) await moveHabit(tx, userId, habitId, position);
                        return { result: { habitId: row.id, title: row.title }, id: row.id };
                    }),
                );
                if (audience && audience.length > 1 && !(result as { deduped?: boolean }).deduped) {
                    ctx.waitUntil?.(broadcastLive(env, userId, audience, [{ type: "routine" }]));
                }
                return result;
            }),
    }),

    delete_habit: tool({
        description:
            "Deletes a routine for good, with its whole history and streaks (can't be undone; archive is the restorable way). Echo the title.",
        inputSchema: z.object({ habitId: z.uuid(), title: z.string().max(255) }),
        execute: async ({ habitId }, { toolCallId }) =>
            safeExecute("delete_habit", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const access = await routineAccess(tx, userId, habitId);
                        if (access.role !== "owner") throw new AppError(404, "NOT_FOUND", "Habit not found");
                        if (access.audience.length > 1) {
                            throw new AppError(
                                403,
                                "FORBIDDEN",
                                "This routine is shared. Delete it from the Routines page.",
                            );
                        }
                        const row = await deleteHabit(tx, userId, habitId);
                        return { result: { deleted: row.title }, id: userId };
                    }),
                ),
            ),
    }),
});
