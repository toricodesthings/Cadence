import { and, asc, eq, inArray, max, min, or, sql } from "drizzle-orm";
import type {
    HabitRow,
    HabitLog,
    InsertHabit,
    ResolveHabitAction,
    RoutineDayShare,
    RoutineToday,
    UpdateHabit,
} from "@cadence/contracts/habit";
import type { ListMember, ListRole } from "@cadence/contracts/sharing";
import {
    habitDays,
    habitOccurrences,
    applyTimeMark,
    likelyOpenTime,
    stepDayStatus,
    timeDayStatus,
    timeMarksOn,
} from "@cadence/domain/repeats";
import {
    addDays,
    dayOf,
    parseRecurrenceRule,
    todayIn,
    wallTimeOf,
    type LocalDate,
    type Zone,
} from "@cadence/domain/time";
import { habits, habitLogs, habitTags, routineCheers, routineMembers } from "../../db/schema";
import { AppError, assertNoConflict, throwIfNotFound } from "../../platform/errors";
import { checkIdempotency, insertWithClientId, recordMutation } from "../../platform/idempotency";
import { routineAccess } from "../../platform/list-access";
import { assertOwnership } from "../../platform/ownership";
import { userZone } from "../../platform/user-zone";
import type { Tx } from "../../types/db";
import { pruneRoutineReports } from "../ai/memory/memory.service";
import { assertRowRoom } from "../../platform/storage-ceiling";
import { reanchoredOrder, reorderTurns, turnFor, turnHabitFrom, turnOrderOf } from "./routine-turns";

export { reanchoredOrder, reorderTurns, turnFor, turnHabitFrom, turnOrderOf };

function laterDate(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a >= b ? a : b;
}

export async function setRoutineMemberPrefs(
    tx: Tx,
    habitId: string,
    prefs: { reminderEnabled?: boolean; sortOrder?: number; pausedUntil?: string | null },
): Promise<void> {
    const [row] = await tx.select({ ok: sql<boolean>`r.ok` }).from(
        sql`cadence_set_routine_member_prefs(
                ${habitId}::uuid,
                ${prefs.reminderEnabled !== undefined}, ${prefs.reminderEnabled ?? false},
                ${prefs.sortOrder !== undefined}, ${prefs.sortOrder ?? 0},
                ${prefs.pausedUntil !== undefined}, ${prefs.pausedUntil ?? null}::date
            ) AS r(ok)`,
    );
    if (!row?.ok) throw new AppError(404, "NOT_FOUND", "Routine not found");
}

async function setRoutineMemberStats(
    tx: Tx,
    habitId: string,
    stats: { currentStreak: number; longestStreak: number; totalCompletions: number; totalSkips: number },
): Promise<void> {
    await tx.select({ ok: sql<boolean>`r.ok` }).from(
        sql`cadence_set_routine_member_stats(
                ${habitId}::uuid,
                ${stats.currentStreak},
                ${stats.longestStreak},
                ${stats.totalCompletions},
                ${stats.totalSkips}
            ) AS r(ok)`,
    );
}

export type ResolvedHabitRow = HabitRow & {
    access: ListRole;
    members: ListMember[];
    today: RoutineToday;
    participants: string[];
};

export async function loadHabitsForCaller(
    tx: Tx,
    userId: string,
    {
        archived,
        habitId,
        zone: providedZone,
        today: providedToday,
    }: { archived?: boolean; habitId?: string; zone?: Zone; today?: LocalDate } = {},
): Promise<{ rows: ResolvedHabitRow[]; zone: Zone; today: LocalDate }> {
    const zone = providedZone ?? (await userZone(tx, userId));
    const today = providedToday ?? todayIn(zone);

    const conditions = [or(eq(habits.userId, userId), eq(routineMembers.userId, userId))];
    if (archived !== undefined) conditions.push(eq(habits.archived, archived));
    if (habitId) conditions.push(eq(habits.id, habitId));

    const joined = await tx
        .select({
            habit: habits,
            member: routineMembers,
        })
        .from(habits)
        .leftJoin(routineMembers, and(eq(routineMembers.habitId, habits.id), eq(routineMembers.userId, userId)))
        .where(and(...conditions));

    if (joined.length === 0) return { rows: [], zone, today };

    const ids = joined.map((j) => j.habit.id);
    const [allMembers, todayLogs, todayCheers] = await Promise.all([
        tx
            .select({
                habitId: routineMembers.habitId,
                userId: routineMembers.userId,
                role: routineMembers.role,
                invitedBy: routineMembers.invitedBy,
            })
            .from(routineMembers)
            .where(inArray(routineMembers.habitId, ids))
            .orderBy(asc(routineMembers.joinedAt)),
        tx
            .select({
                habitId: habitLogs.habitId,
                userId: habitLogs.userId,
                status: habitLogs.status,
            })
            .from(habitLogs)
            .where(
                and(
                    inArray(habitLogs.habitId, ids),
                    eq(habitLogs.targetDate, today),
                    eq(habitLogs.status, "COMPLETED"),
                ),
            ),
        tx
            .select({
                habitId: routineCheers.habitId,
                fromUserId: routineCheers.fromUserId,
            })
            .from(routineCheers)
            .where(
                and(
                    inArray(routineCheers.habitId, ids),
                    eq(routineCheers.toUserId, userId),
                    eq(routineCheers.targetDate, today),
                ),
            ),
    ]);

    const membersByHabit = new Map<string, ListMember[]>();
    for (const m of allMembers) {
        const list = membersByHabit.get(m.habitId) ?? [];
        list.push({ userId: m.userId, role: m.role, invitedBy: m.invitedBy });
        membersByHabit.set(m.habitId, list);
    }
    const completedTodayByHabit = new Map<string, string[]>();
    for (const l of todayLogs) {
        if (l.userId === userId) continue;
        const list = completedTodayByHabit.get(l.habitId) ?? [];
        list.push(l.userId);
        completedTodayByHabit.set(l.habitId, list);
    }
    const cheersTodayByHabit = new Map<string, string[]>();
    for (const ch of todayCheers) {
        const list = cheersTodayByHabit.get(ch.habitId) ?? [];
        list.push(ch.fromUserId);
        cheersTodayByHabit.set(ch.habitId, list);
    }

    const baseRows: ResolvedHabitRow[] = joined.map(({ habit, member }) => {
        const access: ListRole = habit.userId === userId ? "owner" : (member?.role ?? "view");
        const members = membersByHabit.get(habit.id) ?? [];
        const participants = [
            habit.userId,
            ...members.filter((m) => m.role === "edit" && m.userId !== habit.userId).map((m) => m.userId),
        ];
        const effectiveOrder = habit.shareMode === "turns" ? turnOrderOf(habit, participants) : habit.turnOrder;
        const turn = habit.shareMode === "turns" && effectiveOrder ? turnFor(habit, effectiveOrder, today, zone) : null;
        const others = (completedTodayByHabit.get(habit.id) ?? []).map((uid) => ({
            userId: uid,
            status: "COMPLETED" as const,
        }));
        const cheers = cheersTodayByHabit.get(habit.id) ?? [];

        if (access === "owner") {
            return {
                ...habit,
                turnOrder: effectiveOrder,
                access,
                members,
                participants,
                today: { turn, others, cheers },
            };
        }

        if (access === "view") {
            return {
                ...habit,
                projectId: null,
                sortOrder: member?.sortOrder ?? 0,
                reminderEnabled: false,
                pausedUntil: laterDate(habit.pausedUntil, member?.pausedUntil ?? null),
                currentStreak: 0,
                longestStreak: 0,
                totalCompletions: 0,
                totalSkips: 0,
                steps: null,
                times: null,
                targetTime: null,
                targetTimes: null,
                turnOrder: effectiveOrder,
                access,
                members,
                participants,
                today: { turn: null, others, cheers: [] },
            };
        }

        const useHouseholdStreak = habit.shareMode === "turns";
        return {
            ...habit,
            projectId: null,
            sortOrder: member?.sortOrder ?? 0,
            reminderEnabled: member?.reminderEnabled ?? false,
            pausedUntil: laterDate(habit.pausedUntil, member?.pausedUntil ?? null),
            currentStreak: useHouseholdStreak ? habit.currentStreak : (member?.currentStreak ?? 0),
            longestStreak: useHouseholdStreak ? habit.longestStreak : (member?.longestStreak ?? 0),
            totalCompletions: useHouseholdStreak ? habit.totalCompletions : (member?.totalCompletions ?? 0),
            totalSkips: useHouseholdStreak ? habit.totalSkips : (member?.totalSkips ?? 0),
            turnOrder: effectiveOrder,
            access,
            members,
            participants,
            today: { turn, others, cheers },
        };
    });

    const withStreaks = await withLiveStreaks(tx, userId, baseRows, zone, today);
    withStreaks.sort((a, b) => {
        const aOwn = a.access === "owner" ? 0 : 1;
        const bOwn = b.access === "owner" ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return b.createdAt.localeCompare(a.createdAt);
    });
    return { rows: withStreaks, zone, today };
}

export function projectHabitRange<
    H extends HabitRow & Partial<Pick<ResolvedHabitRow, "access" | "members" | "today" | "participants">>,
>(
    {
        userHabits,
        logs,
        allTags,
        callerId,
    }: { userHabits: H[]; logs: HabitLog[]; allTags: { habitId: string; tagId: string }[]; callerId?: string },
    { start, end, timeZone: tz, today: todayStr }: { start: string; end: string; timeZone: string; today: string },
) {
    const tagsByHabit = new Map<string, string[]>();
    for (const t of allTags) {
        const arr = tagsByHabit.get(t.habitId) || [];
        arr.push(t.tagId);
        tagsByHabit.set(t.habitId, arr);
    }

    const logsByHabit = new Map<string, Map<string, HabitLog[]>>();
    for (const log of logs) {
        let byDate = logsByHabit.get(log.habitId);
        if (!byDate) {
            byDate = new Map();
            logsByHabit.set(log.habitId, byDate);
        }
        const list = byDate.get(log.targetDate) ?? [];
        list.push(log);
        byDate.set(log.targetDate, list);
    }

    return userHabits.map((habit) => {
        const access = habit.access ?? "owner";
        const isSupporter = access === "view";
        const isTurns = habit.shareMode === "turns";
        const byDate = logsByHabit.get(habit.id) ?? new Map<string, HabitLog[]>();

        const primaryLogByDate = new Map<string, HabitLog>();
        for (const [dateKey, dayLogs] of byDate) {
            if (isSupporter) {
                const completed = dayLogs.find((l) => l.status === "COMPLETED");
                if (completed) primaryLogByDate.set(dateKey, completed);
            } else if (isTurns) {
                const mine = callerId ? dayLogs.find((l) => l.userId === callerId) : dayLogs[0];
                const resolved = dayLogs.find((l) => l.status === "COMPLETED" || l.status === "SKIPPED");
                const chosen = mine ?? resolved;
                if (chosen) primaryLogByDate.set(dateKey, chosen);
            } else {
                const mine = callerId ? dayLogs.find((l) => l.userId === callerId) : dayLogs[0];
                if (mine) primaryLogByDate.set(dateKey, mine);
            }
        }

        const days = habitDays(habit, primaryLogByDate, start, end, tz, todayStr);
        const dayShares: Record<string, RoutineDayShare> = {};
        const order = isTurns && habit.participants ? turnOrderOf(habit, habit.participants) : (habit.turnOrder ?? []);

        const logsHydrated = days.map(({ date: dateKey, log: existingLog }) => {
            const rawDayLogs = byDate.get(dateKey) ?? [];
            const others = rawDayLogs
                .filter((l) => l.status === "COMPLETED" && (!callerId || l.userId !== callerId) && l.userId)
                .map((l) => ({ userId: l.userId!, status: "COMPLETED" as const }));
            const turn = isTurns && !isSupporter && order.length > 0 ? turnFor(habit, order, dateKey, tz) : null;
            dayShares[dateKey] = { turn, others };

            if (isSupporter) {
                const completed = rawDayLogs.find((l) => l.status === "COMPLETED");
                return {
                    id: completed?.id || `virt_${dateKey}`,
                    habitId: habit.id,
                    status: (completed ? "COMPLETED" : "PENDING") as HabitLog["status"],
                    targetDate: dateKey,
                    completedAt: completed?.completedAt || null,
                    stepStatus: null,
                    timeMarks: null,
                };
            }

            return {
                id: existingLog?.id || `virt_${dateKey}`,
                habitId: habit.id,
                userId: existingLog?.userId,
                status: existingLog?.status || "PENDING",
                targetDate: dateKey,
                completedAt: existingLog?.completedAt || null,
                stepStatus: existingLog?.stepStatus ?? null,
                timeMarks: existingLog?.timeMarks ?? null,
            };
        });

        const completedInWindow = logsHydrated.filter((l) => l.status === "COMPLETED").length;
        const pendingInWindow = logsHydrated.filter((l) => l.status === "PENDING").length;
        const scheduledInWindow = logsHydrated.length;
        const adherenceInWindow = scheduledInWindow > 0 ? completedInWindow / scheduledInWindow : 0;

        const isDueToday = !isSupporter && days.some((day) => day.date === todayStr);
        const isOverdue = !isSupporter && logsHydrated.some((l) => l.status === "PENDING" && l.targetDate < todayStr);

        const { participants: _participants, ...rest } = habit;
        return {
            ...rest,
            tagIds: access === "owner" ? tagsByHabit.get(habit.id) || [] : [],
            logs: logsHydrated,
            days: dayShares,
            isDueToday,
            isOverdue,
            pendingCountInWindow: isSupporter ? 0 : pendingInWindow,
            completedCountInWindow: isSupporter ? completedInWindow : completedInWindow,
            scheduledCountInWindow: scheduledInWindow,
            adherenceRateInWindow: isSupporter ? 0 : Math.round(adherenceInWindow * 100) / 100,
        };
    });
}

function recomputeStreaks(
    logs: Array<{ targetDate: string; status: string }>,
    occurrenceDates: string[],
    today: string,
): { currentStreak: number; longestStreak: number; totalCompletions: number; totalSkips: number } {
    const logByDate = new Map<string, string>();
    let totalCompletions = 0;
    let totalSkips = 0;
    for (const log of logs) {
        logByDate.set(log.targetDate, log.status);
        if (log.status === "COMPLETED") totalCompletions++;
        if (log.status === "SKIPPED") totalSkips++;
    }

    const sorted = [...occurrenceDates].sort((a, b) => b.localeCompare(a));
    let currentStreak: number | null = null;
    let longestStreak = 0;
    let streak = 0;

    for (const date of sorted) {
        const status = logByDate.get(date);
        if (status === "COMPLETED") {
            streak++;
        } else if (status !== "SKIPPED") {
            if (date >= today) continue;

            if (streak > longestStreak) longestStreak = streak;
            currentStreak ??= streak;
            streak = 0;
        }
    }
    if (streak > longestStreak) longestStreak = streak;
    currentStreak ??= streak;

    return { currentStreak, longestStreak, totalCompletions, totalSkips };
}

async function loadResolvedOccurrenceDates(
    tx: Tx,
    habitId: string,
    logUser: string | null,
    dates: string[],
): Promise<Map<string, ResolvedStatus>> {
    if (dates.length === 0) return new Map();
    const conds = [
        eq(habitLogs.habitId, habitId),
        inArray(habitLogs.status, ["COMPLETED", "SKIPPED"]),
        inArray(habitLogs.targetDate, dates),
    ];
    if (logUser) conds.push(eq(habitLogs.userId, logUser));
    const rows = await tx
        .select({ targetDate: habitLogs.targetDate, status: habitLogs.status })
        .from(habitLogs)
        .where(and(...conds));
    const map = new Map<string, ResolvedStatus>();
    for (const r of rows) {
        if (map.get(r.targetDate) !== "COMPLETED") map.set(r.targetDate, r.status as ResolvedStatus);
    }
    return map;
}

type ResolvedStatus = "COMPLETED" | "SKIPPED";

const STREAK_BATCH = 60;

type StreakScanState = { streak: number; runStarted: boolean };

export function scanStreak(
    windowNewestFirst: string[],
    resolved: ReadonlyMap<string, ResolvedStatus>,
    state: StreakScanState,
    today: string,
): StreakScanState & { terminated: boolean } {
    let { streak, runStarted } = state;
    for (const date of windowNewestFirst) {
        const status = resolved.get(date);
        if (status === "SKIPPED") continue;
        if (status === "COMPLETED") {
            streak++;
            runStarted = true;
        } else if (date >= today) {
            continue;
        } else {
            return { streak, runStarted, terminated: true };
        }
    }
    return { streak, runStarted, terminated: false };
}

export async function computeCurrentStreak(
    recurrenceRule: string,
    createdAt: string,
    asOfDateStr: string,
    loadResolved: (dates: string[]) => Promise<ReadonlyMap<string, ResolvedStatus>>,
    { timeZone = "UTC", earliest }: { timeZone?: string; earliest?: string | null } = {},
): Promise<number> {
    const created = dayOf(createdAt, timeZone);
    const from = earliest && earliest < created ? earliest : created;
    const dates = habitOccurrences(recurrenceRule, String(createdAt), from, asOfDateStr, timeZone).reverse();

    const BATCH_SIZE = STREAK_BATCH;
    let state: StreakScanState = { streak: 0, runStarted: false };
    for (let cursor = 0; cursor < dates.length; cursor += BATCH_SIZE) {
        const window = dates.slice(cursor, cursor + BATCH_SIZE);

        const result = scanStreak(window, await loadResolved(window), state, asOfDateStr);
        if (result.terminated) return result.streak;
        state = { streak: result.streak, runStarted: result.runStarted };
    }

    return state.streak;
}

export async function withLiveStreaks<
    T extends {
        id: string;
        recurrenceRule: string;
        createdAt: string;
        pausedUntil: string | null;
        currentStreak: number;
        shareMode?: "together" | "turns" | null;
        access?: ListRole;
    },
>(tx: Tx, userId: string, rows: T[], zone: Zone, today: LocalDate = todayIn(zone)): Promise<T[]> {
    const lasts = new Map<string, string>();
    for (const row of rows) {
        if (row.access === "view") continue;
        const last = habitDays(row, new Map(), addDays(today, -400), addDays(today, -1), zone, today).at(-1)?.date;
        if (last) lasts.set(row.id, last);
    }
    if (lasts.size === 0) return rows;
    const resolved = await tx
        .select({
            habitId: habitLogs.habitId,
            userId: habitLogs.userId,
            targetDate: habitLogs.targetDate,
            status: habitLogs.status,
        })
        .from(habitLogs)
        .where(
            and(
                inArray(habitLogs.habitId, [...lasts.keys()]),
                inArray(habitLogs.targetDate, [...new Set([...lasts.values(), today])]),
                inArray(habitLogs.status, ["COMPLETED", "SKIPPED"]),
            ),
        );
    const okAny = new Set(resolved.map((r) => `${r.habitId}|${r.targetDate}`));
    const okMine = new Set(resolved.filter((r) => r.userId === userId).map((r) => `${r.habitId}|${r.targetDate}`));
    const doneTodayAny = new Set(
        resolved.filter((r) => r.targetDate === today && r.status === "COMPLETED").map((r) => r.habitId),
    );
    const doneTodayMine = new Set(
        resolved
            .filter((r) => r.userId === userId && r.targetDate === today && r.status === "COMPLETED")
            .map((r) => r.habitId),
    );
    return rows.map((row) => {
        if (row.access === "view") return { ...row, currentStreak: 0 };
        const last = lasts.get(row.id);
        const isTurns = row.shareMode === "turns";
        const set = isTurns ? okAny : okMine;
        const doneToday = isTurns ? doneTodayAny : doneTodayMine;
        if (doneToday.has(row.id)) return row;
        return last && !set.has(`${row.id}|${last}`) ? { ...row, currentStreak: 0 } : row;
    });
}

export async function createHabit(tx: Tx, userId: string, { tagIds, ...body }: InsertHabit, idempotencyKey?: string) {
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (existingId) {
        const [existing] = await tx
            .select()
            .from(habits)
            .where(and(eq(habits.id, existingId), eq(habits.userId, userId)));
        if (existing) return existing;
    }

    parseRecurrenceRule(body.recurrenceRule);
    normalizeTimes(body);
    if (body.times?.length && body.reminderEnabled === undefined) body.reminderEnabled = true;
    assertStepsOrTimes(body);
    await assertOwnership(tx, userId, { projectId: body.projectId, tagIds });
    await assertRowRoom(tx, userId, "routines");
    if (body.sortOrder === undefined) {
        const [{ last }] = await tx
            .select({ last: max(habits.sortOrder) })
            .from(habits)
            .where(eq(habits.userId, userId));
        body.sortOrder = (last ?? 0) + 1;
    }

    const [row] = await insertWithClientId(() =>
        tx
            .insert(habits)
            .values({ ...body, userId })
            .returning(),
    );

    if (tagIds && tagIds.length > 0) {
        await tx.insert(habitTags).values(tagIds.map((tagId) => ({ habitId: row.id, tagId, userId })));
    }

    await recordMutation(tx, userId, idempotencyKey, row.id);
    return row;
}

type HabitDbRow = typeof habits.$inferSelect;
type HabitLogDbRow = typeof habitLogs.$inferSelect;
type DayMarks = {
    status: HabitLogDbRow["status"];
    stepStatus: HabitLogDbRow["stepStatus"];
    timeMarks: HabitLogDbRow["timeMarks"];
};

function resolveDay(
    habit: HabitDbRow,
    existing: HabitLogDbRow | undefined,
    targetDate: LocalDate,
    action: Omit<ResolveHabitAction, "targetDate">,
    zone: Zone,
): DayMarks {
    const stepIds = (habit.steps ?? []).map((step) => step.id);
    const times = habit.times ?? [];
    if (!times.length) {
        return stepIds.length && action.stepStatus
            ? { ...stepDayStatus(stepIds, action.stepStatus), timeMarks: null }
            : { status: action.status, stepStatus: null, timeMarks: null };
    }
    if (action.time && !times.includes(action.time))
        throw new AppError(400, "VALIDATION_ERROR", "This routine has no such time.");
    const at = action.at ?? new Date().toISOString();
    const time =
        !action.time && action.status === "COMPLETED"
            ? impliedTime(times, existing, targetDate, at, zone)
            : action.time;
    return { ...applyTimeMark(times, existing, { time, status: action.status, at }), stepStatus: null };
}

function impliedTime(
    times: string[],
    existing: HabitLogDbRow | undefined,
    targetDate: LocalDate,
    at: string,
    zone: Zone,
): string {
    const marks = timeMarksOn(times, existing);
    const time = likelyOpenTime(times, marks, targetDate === todayIn(zone, new Date(at)) ? wallTimeOf(at, zone) : null);
    if (time) return time;
    const open = times.filter((entry) => !marks[entry]);
    throw new AppError(
        400,
        "VALIDATION_ERROR",
        open.length
            ? `Which time? Still open: ${open.join(", ")}. Ask the user, then send that time.`
            : "Every time is already checked off that day.",
    );
}

async function writeDayLog(
    tx: Tx,
    userId: string,
    habitId: string,
    targetDate: LocalDate,
    existing: HabitLogDbRow | undefined,
    day: DayMarks,
) {
    const { status, stepStatus, timeMarks } = day;
    if (status === "PENDING" && !stepStatus && !timeMarks) {
        if (!existing) {
            return {
                id: `virt_${targetDate}`,
                habitId,
                userId,
                status: "PENDING" as const,
                targetDate,
                completedAt: null,
                resolvedAt: null,
                stepStatus: null,
                timeMarks: null,
                createdAt: new Date().toISOString(),
            };
        }
        await tx.delete(habitLogs).where(eq(habitLogs.id, existing.id));
        return {
            ...existing,
            status: "PENDING" as const,
            completedAt: null,
            resolvedAt: null,
            stepStatus: null,
            timeMarks: null,
        };
    }
    const now = sql`NOW()`;
    const values = { status, stepStatus, timeMarks, completedAt: status === "COMPLETED" ? now : null, resolvedAt: now };
    const [row] = existing
        ? await tx.update(habitLogs).set(values).where(eq(habitLogs.id, existing.id)).returning()
        : await tx
              .insert(habitLogs)
              .values({ userId, habitId, targetDate, ...values })
              .returning();
    return row;
}

async function recomputeStreak(
    tx: Tx,
    logUser: string | null,
    habit: HabitDbRow,
    longestBase: number,
    targetDate: LocalDate,
    zone: Zone,
) {
    const todayStr = todayIn(zone);
    const occurrencesAfter =
        targetDate < todayStr
            ? habitOccurrences(habit.recurrenceRule, String(habit.createdAt), addDays(targetDate, 1), todayStr, zone)
            : [];

    if (occurrencesAfter.length === 0) {
        const earliestConds = [eq(habitLogs.habitId, habit.id), eq(habitLogs.status, "COMPLETED")];
        if (logUser) earliestConds.push(eq(habitLogs.userId, logUser));
        const [{ earliest }] = await tx
            .select({ earliest: min(habitLogs.targetDate) })
            .from(habitLogs)
            .where(and(...earliestConds));
        const currentStreak = await computeCurrentStreak(
            habit.recurrenceRule,
            habit.createdAt,
            todayStr,
            (dates) => loadResolvedOccurrenceDates(tx, habit.id, logUser, dates),
            { timeZone: zone, earliest },
        );
        return { currentStreak, longestStreak: Math.max(longestBase, currentStreak) };
    }

    const logConds = [eq(habitLogs.habitId, habit.id)];
    if (logUser) logConds.push(eq(habitLogs.userId, logUser));
    const allLogs = await tx
        .select({ targetDate: habitLogs.targetDate, status: habitLogs.status })
        .from(habitLogs)
        .where(and(...logConds));

    const firstDay = allLogs.reduce(
        (first, log) => (log.targetDate < first ? log.targetDate : first),
        dayOf(habit.createdAt, zone),
    );
    const allOccurrences = habitOccurrences(habit.recurrenceRule, String(habit.createdAt), firstDay, todayStr, zone);
    const streakData = recomputeStreaks(allLogs, allOccurrences, todayStr);
    return {
        currentStreak: streakData.currentStreak,
        longestStreak: Math.max(longestBase, streakData.longestStreak),
    };
}

export async function resolveHabit(tx: Tx, userId: string, id: string, { targetDate, ...action }: ResolveHabitAction) {
    const access = await routineAccess(tx, userId, id);
    if (access.role === "view") {
        throw new AppError(403, "VIEW_ONLY", "You're cheering this one on; only participants check it off.");
    }

    const [habit] = await tx.select().from(habits).where(eq(habits.id, id)).for("update");
    throwIfNotFound(habit, "Habit");

    const times = habit.times ?? [];
    if (times.length && !action.time && action.status === "SKIPPED") {
        throw new AppError(400, "VALIDATION_ERROR", "This routine is skipped one time at a time; send each time.");
    }

    const dayLogs = await tx
        .select()
        .from(habitLogs)
        .where(and(eq(habitLogs.habitId, habit.id), eq(habitLogs.targetDate, targetDate)));

    const existing = dayLogs.find((l) => l.userId === userId);
    const otherResolved = dayLogs.find(
        (l) => l.userId !== userId && (l.status === "COMPLETED" || l.status === "SKIPPED"),
    );
    const isTurns = habit.shareMode === "turns";
    const zone = await userZone(tx, userId);

    if (isTurns && otherResolved) {
        const isClear = action.status === "PENDING" && !action.stepStatus && !action.time;
        if (isClear) {
            if (access.role !== "owner") {
                throw new AppError(403, "OWNER_ONLY", "Only the person who logged this day or the owner can clear it.");
            }
            await tx.delete(habitLogs).where(eq(habitLogs.id, otherResolved.id));
            const totalCompletions = Math.max(0, habit.totalCompletions - Number(otherResolved.status === "COMPLETED"));
            const totalSkips = Math.max(0, habit.totalSkips - Number(otherResolved.status === "SKIPPED"));
            const { currentStreak, longestStreak } = await recomputeStreak(
                tx,
                null,
                habit,
                habit.longestStreak,
                targetDate,
                zone,
            );
            const [updatedHabit] = await tx
                .update(habits)
                .set({ totalCompletions, totalSkips, currentStreak, longestStreak, updatedAt: sql`NOW()` })
                .where(eq(habits.id, habit.id))
                .returning();
            return {
                habit: updatedHabit,
                log: {
                    ...otherResolved,
                    status: "PENDING" as const,
                    completedAt: null,
                    resolvedAt: null,
                    stepStatus: null,
                    timeMarks: null,
                },
            };
        }
        return { habit, log: otherResolved };
    }

    const day = resolveDay(habit, existing, targetDate, action, zone);
    const row = await writeDayLog(tx, userId, habit.id, targetDate, existing, day);
    await pruneRoutineReports(tx, userId, habit.id, targetDate, row);

    const was = existing?.status;
    const deltaComplete = Number(day.status === "COMPLETED") - Number(was === "COMPLETED");
    const deltaSkip = Number(day.status === "SKIPPED") - Number(was === "SKIPPED");
    const useHouseholdStats = access.role === "owner" || isTurns;

    if (useHouseholdStats) {
        const totalCompletions = Math.max(0, habit.totalCompletions + deltaComplete);
        const totalSkips = Math.max(0, habit.totalSkips + deltaSkip);
        const { currentStreak, longestStreak } = await recomputeStreak(
            tx,
            isTurns ? null : userId,
            habit,
            habit.longestStreak,
            targetDate,
            zone,
        );
        const [updatedHabit] = await tx
            .update(habits)
            .set({ totalCompletions, totalSkips, currentStreak, longestStreak, updatedAt: sql`NOW()` })
            .where(eq(habits.id, habit.id))
            .returning();
        return { habit: updatedHabit, log: row };
    }

    const [myMember] = await tx
        .select()
        .from(routineMembers)
        .where(and(eq(routineMembers.habitId, habit.id), eq(routineMembers.userId, userId)));
    const totalCompletions = Math.max(0, (myMember?.totalCompletions ?? 0) + deltaComplete);
    const totalSkips = Math.max(0, (myMember?.totalSkips ?? 0) + deltaSkip);
    const { currentStreak, longestStreak } = await recomputeStreak(
        tx,
        userId,
        habit,
        myMember?.longestStreak ?? 0,
        targetDate,
        zone,
    );
    await setRoutineMemberStats(tx, habit.id, { currentStreak, longestStreak, totalCompletions, totalSkips });
    return {
        habit: { ...habit, currentStreak, longestStreak, totalCompletions, totalSkips },
        log: row,
    };
}

function normalizeTimes(body: { times?: string[] | null; targetTime?: string | null }) {
    if (!body.times) return;
    body.times = [...body.times].sort();
    if (body.times.length < 2)
        Object.assign(body, { targetTime: body.times[0] ?? body.targetTime ?? null, times: null });
}

function assertStepsOrTimes({ steps, times }: { steps?: unknown[] | null; times?: unknown[] | null }) {
    if (steps?.length && times?.length)
        throw new AppError(400, "VALIDATION_ERROR", "A routine has steps or set times, not both.");
}

async function lockStepsAndTimes(tx: Tx, userId: string, id: string, body: Pick<UpdateHabit, "steps" | "times">) {
    if (body.times === undefined && body.steps === undefined) return undefined;
    const [before] = await tx
        .select({ steps: habits.steps, times: habits.times })
        .from(habits)
        .where(and(eq(habits.id, id), eq(habits.userId, userId)))
        .for("update");
    if (before)
        assertStepsOrTimes({
            steps: body.steps !== undefined ? body.steps : before.steps,
            times: body.times !== undefined ? body.times : before.times,
        });
    return before;
}

async function replaceHabitTags(tx: Tx, userId: string, id: string, tagIds: string[]) {
    await tx.delete(habitTags).where(eq(habitTags.habitId, id));
    if (tagIds.length > 0) {
        await tx.insert(habitTags).values(tagIds.map((tagId) => ({ habitId: id, tagId, userId })));
    }
}

export async function updateHabit(
    tx: Tx,
    userId: string,
    id: string,
    { expectedUpdatedAt, tagIds, ...body }: UpdateHabit,
    callerId: string = userId,
) {
    if (body.recurrenceRule !== undefined) parseRecurrenceRule(body.recurrenceRule);
    normalizeTimes(body);
    const before = await lockStepsAndTimes(tx, userId, id, body);
    if (expectedUpdatedAt) {
        const [existing] = await tx
            .select({ updatedAt: habits.updatedAt })
            .from(habits)
            .where(and(eq(habits.id, id), eq(habits.userId, userId)));
        throwIfNotFound(existing, "Habit");
        assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Habit");
    }

    await assertOwnership(tx, userId, { projectId: body.projectId, tagIds });

    const [row] = await tx
        .update(habits)
        .set({ ...body, updatedAt: sql`NOW()` })
        .where(and(eq(habits.id, id), eq(habits.userId, userId)))
        .returning();

    throwIfNotFound(row, "Habit");

    if (tagIds !== undefined) await replaceHabitTags(tx, userId, id, tagIds);

    if (body.times !== undefined)
        return (await followTimes(tx, callerId, id, row, before?.times ?? [], row.times ?? [])) ?? row;
    if (body.steps !== undefined) return (await followSteps(tx, callerId, id, row)) ?? row;
    return row;
}

async function syncOtherMemberTodayLog(
    tx: Tx,
    habit: HabitDbRow,
    log: HabitLogDbRow,
    derivedStatus: HabitLogDbRow["status"],
    today: LocalDate,
    zone: Zone,
): Promise<HabitDbRow | undefined> {
    await tx.execute(
        sql`SELECT cadence_sync_routine_log_status(${log.id}::uuid, ${derivedStatus}::habit_status, ${derivedStatus === "COMPLETED" ? sql`now()` : sql`NULL`})`,
    );
    if (habit.shareMode !== "turns") return undefined;
    const deltaComplete = Number(derivedStatus === "COMPLETED") - Number(log.status === "COMPLETED");
    const deltaSkip = Number(derivedStatus === "SKIPPED") - Number(log.status === "SKIPPED");
    const totalCompletions = Math.max(0, habit.totalCompletions + deltaComplete);
    const totalSkips = Math.max(0, habit.totalSkips + deltaSkip);
    const { currentStreak, longestStreak } = await recomputeStreak(tx, null, habit, habit.longestStreak, today, zone);
    const [updated] = await tx
        .update(habits)
        .set({ totalCompletions, totalSkips, currentStreak, longestStreak, updatedAt: sql`NOW()` })
        .where(eq(habits.id, habit.id))
        .returning();
    return updated;
}

async function followSteps(tx: Tx, callerId: string, id: string, habit: HabitDbRow) {
    const stepIds = (habit.steps ?? []).map((step) => step.id);
    if (!stepIds.length || habit.times?.length) return undefined;
    const zone = await userZone(tx, callerId);
    const today = todayIn(zone);
    const logs = await tx
        .select()
        .from(habitLogs)
        .where(and(eq(habitLogs.habitId, id), eq(habitLogs.targetDate, today)));
    let updated: HabitDbRow | undefined;
    for (const log of logs) {
        if (!log.stepStatus) continue;
        const derived = stepDayStatus(stepIds, log.stepStatus);
        if (derived.status === log.status) continue;
        if (log.userId === callerId) {
            updated = (
                await resolveHabit(tx, callerId, id, {
                    targetDate: today,
                    status: "PENDING",
                    stepStatus: log.stepStatus,
                })
            ).habit;
        } else {
            updated =
                (await syncOtherMemberTodayLog(tx, updated ?? habit, log, derived.status, today, zone)) ?? updated;
        }
    }
    return updated;
}

async function followTimes(
    tx: Tx,
    callerId: string,
    id: string,
    habit: HabitDbRow,
    oldTimes: string[],
    newTimes: string[],
) {
    if (oldTimes.join() === newTimes.join()) return undefined;
    const removed = oldTimes.filter((time) => !newTimes.includes(time));
    const added = newTimes.filter((time) => !oldTimes.includes(time));
    if (removed.length === 1 && added.length === 1) {
        await tx.execute(
            sql`SELECT cadence_move_routine_time_marks(${id}::uuid, ${removed[0]}::text, ${added[0]}::text)`,
        );
    }

    if (!newTimes.length) return undefined;
    const zone = await userZone(tx, callerId);
    const today = todayIn(zone);
    const logs = await tx
        .select()
        .from(habitLogs)
        .where(and(eq(habitLogs.habitId, id), eq(habitLogs.targetDate, today)));
    let updated: HabitDbRow | undefined;
    for (const log of logs) {
        const marks = timeMarksOn(newTimes, log);
        const derivedStatus = timeDayStatus(newTimes, marks);
        if (derivedStatus === log.status) continue;
        if (log.userId === callerId) {
            const [time, mark] = Object.entries(marks)[0] ?? [newTimes[0], undefined];
            updated = (
                await resolveHabit(tx, callerId, id, {
                    targetDate: today,
                    time,
                    status: mark?.status ?? "PENDING",
                    at: mark?.at ?? undefined,
                })
            ).habit;
        } else {
            updated = (await syncOtherMemberTodayLog(tx, updated ?? habit, log, derivedStatus, today, zone)) ?? updated;
        }
    }
    return updated;
}

export async function moveHabit(tx: Tx, userId: string, id: string, position: number) {
    const rows = await tx
        .select({ id: habits.id })
        .from(habits)
        .where(eq(habits.userId, userId))
        .orderBy(habits.sortOrder, habits.createdAt);
    if (!rows.some((row) => row.id === id)) throwIfNotFound(undefined, "Habit");
    const order = rows.map((row) => row.id).filter((rowId) => rowId !== id);
    order.splice(Math.min(position - 1, order.length), 0, id);
    await Promise.all(
        order.map((rowId, sortOrder) =>
            tx
                .update(habits)
                .set({ sortOrder })
                .where(and(eq(habits.id, rowId), eq(habits.userId, userId))),
        ),
    );
}

export async function deleteHabit(tx: Tx, userId: string, id: string) {
    const [row] = await tx
        .delete(habits)
        .where(and(eq(habits.id, id), eq(habits.userId, userId)))
        .returning();
    throwIfNotFound(row, "Habit");
    return row;
}
