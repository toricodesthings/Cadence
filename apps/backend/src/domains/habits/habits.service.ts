import { and, eq, inArray, min, sql } from "drizzle-orm";
import type { ResolveHabitAction } from "@cadence/contracts/habit";
import { habitOccurrences, habitRule, localDay } from "@cadence/domain/repeats";
import { habits, habitLogs } from "../../db/schema";
import { throwIfNotFound } from "../../platform/errors";
import { resolveTimeZone, toLocalDateStr } from "../../platform/date-utils";
import { logger, shorten, issuesFromError } from "../../platform/log";
import type { Tx } from "../../types/db";

// ── Utility ───────────────────────────────────────────────────────────

/**
 * Shared recurrence expansion — single source of truth. The days (YYYY-MM-DD)
 * a routine is due in [startDate, endDate]; see `habitRule` for the anchor.
 */
export function expandOccurrences(recurrenceRule: string, createdAt: string, startDate: Date, endDate: Date, timeZone = "UTC"): string[] {
    try {
        return habitOccurrences(recurrenceRule, String(createdAt), startDate, endDate, timeZone);
    } catch (e) {
        logger.warn("http", "recurrence_rule_invalid", {
            rule: shorten(recurrenceRule),
            issues: issuesFromError(e),
        });
        return [];
    }
}

/**
 * Deterministic streak recomputation from habit log history.
 * Walks backward from the most recent completed date; skipped days are neutral.
 */
function recomputeStreaks(
    logs: Array<{ targetDate: string; status: string }>,
    occurrenceDates: string[],
): { currentStreak: number; longestStreak: number; totalCompletions: number; totalSkips: number } {
    const logByDate = new Map<string, string>();
    let totalCompletions = 0;
    let totalSkips = 0;
    for (const log of logs) {
        logByDate.set(log.targetDate, log.status);
        if (log.status === "COMPLETED") totalCompletions++;
        if (log.status === "SKIPPED") totalSkips++;
    }

    // Sort occurrence dates descending for streak computation
    const sorted = [...occurrenceDates].sort((a, b) => b.localeCompare(a));
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    for (const date of sorted) {
        const status = logByDate.get(date);
        if (status === "COMPLETED") {
            streak++;
        } else if (status !== "SKIPPED") { // a skip is a planned rest: it neither extends nor breaks a run
            if (streak > longestStreak) longestStreak = streak;
            // Current streak is only from the most recent unbroken run
            if (currentStreak === 0) currentStreak = streak;
            streak = 0;
        }
    }
    if (streak > longestStreak) longestStreak = streak;
    if (currentStreak === 0) currentStreak = streak;

    return { currentStreak, longestStreak, totalCompletions, totalSkips };
}

/** Which of the given occurrence dates were completed or skipped, keyed by date. */
async function loadResolvedOccurrenceDates(
    tx: Tx,
    habitId: string,
    userId: string,
    dates: string[],
): Promise<Map<string, ResolvedStatus>> {
    if (dates.length === 0) return new Map();
    const rows = await tx
        .select({ targetDate: habitLogs.targetDate, status: habitLogs.status })
        .from(habitLogs)
        .where(and(
            eq(habitLogs.userId, userId),
            eq(habitLogs.habitId, habitId),
            inArray(habitLogs.status, ["COMPLETED", "SKIPPED"]),
            inArray(habitLogs.targetDate, dates),
        ));
    return new Map(rows.map((r) => [r.targetDate, r.status as ResolvedStatus]));
}

type ResolvedStatus = "COMPLETED" | "SKIPPED";

const STREAK_LEADING_LIMIT = 60;

/** Mutable accumulator threaded across occurrence windows by {@link scanStreak}. */
type StreakScanState = { streak: number; runStarted: boolean; leadingGap: number };

/**
 * Pure current-streak reducer. Folds one window of occurrence dates (ordered
 * newest → oldest) into the running streak state.
 *
 * Semantics:
 *  - Trailing not-yet-resolved occurrences (e.g. today still PENDING) are skipped
 *    as a grace period — they do not break the streak before the run begins.
 *  - Skipped occurrences are neutral: they neither extend nor end a run.
 *  - The first missed occurrence *after* the run has started ends it.
 *  - If `leadingLimit` occurrences pass with no completion at all, the streak is
 *    considered broken (0).
 *
 * `terminated` signals the streak is fully determined so the caller can stop
 * fetching further history.
 */
export function scanStreak(
    windowNewestFirst: string[],
    resolved: ReadonlyMap<string, ResolvedStatus>,
    state: StreakScanState,
    leadingLimit = STREAK_LEADING_LIMIT,
): StreakScanState & { terminated: boolean } {
    let { streak, runStarted, leadingGap } = state;
    for (const date of windowNewestFirst) {
        const status = resolved.get(date);
        if (status === "SKIPPED") continue;
        if (status === "COMPLETED") {
            streak++;
            runStarted = true;
        } else if (runStarted) {
            return { streak, runStarted, leadingGap, terminated: true };
        } else if (++leadingGap >= leadingLimit) {
            return { streak: 0, runStarted, leadingGap, terminated: true };
        }
    }
    return { streak, runStarted, leadingGap, terminated: false };
}

/**
 * Current streak = the most recent unbroken run of COMPLETED occurrences ending
 * at (or just before) `asOfDateStr`, for any recurrence cadence.
 *
 * Cost is bounded by the streak length, not by total habit history: occurrences
 * are walked backward in rrule batches and `loadCompleted` is queried per batch,
 * stopping as soon as the streak is determined. This is the correct, cadence-
 * agnostic replacement for a fixed look-back window or a full-history rescan.
 *
 * `loadResolved` is injected (rather than taking a `tx`) so the streak logic is
 * pure of persistence concerns and unit-testable with real recurrence rules.
 * `earliest` (the oldest completed day, when it predates the routine) lets the
 * walk reach days logged before the routine was created.
 */
export async function computeCurrentStreak(
    recurrenceRule: string,
    createdAt: string,
    asOfDateStr: string,
    loadResolved: (dates: string[]) => Promise<ReadonlyMap<string, ResolvedStatus>>,
    { timeZone = "UTC", earliest }: { timeZone?: string; earliest?: string | null } = {},
): Promise<number> {
    let rule: ReturnType<typeof habitRule>;
    try {
        const created = localDay(createdAt, timeZone);
        const from = earliest && earliest < created ? earliest : created;
        rule = habitRule(recurrenceRule, String(createdAt), new Date(`${from}T00:00:00.000Z`), timeZone);
    } catch (e) {
        logger.warn("http", "recurrence_rule_invalid", {
            rule: shorten(recurrenceRule),
            issues: issuesFromError(e),
        });
        return 0;
    }

    const BATCH_SIZE = STREAK_LEADING_LIMIT;
    let state: StreakScanState = { streak: 0, runStarted: false, leadingGap: 0 };
    let cursor: Date | null = new Date(`${asOfDateStr}T23:59:59.999Z`);

    while (cursor) {
        // Collect a batch of occurrence dates walking backward (newest → oldest).
        const window: string[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            const occ: Date | null = rule.before(cursor, true);
            if (!occ) {
                cursor = null;
                break;
            }
            window.push(occ.toISOString().substring(0, 10));
            cursor = new Date(occ.getTime() - 1000); // step strictly before this occurrence
        }
        if (window.length === 0) break;

        const result = scanStreak(window, await loadResolved(window), state);
        if (result.terminated) return result.streak;
        state = { streak: result.streak, runStarted: result.runStarted, leadingGap: result.leadingGap };
    }

    return state.streak;
}

// ── Create ────────────────────────────────────────────────────────────

/**
 * Mark a routine done or skipped for a day (PENDING clears it), keeping its
 * totals and streaks in step.
 */
export async function resolveHabit(tx: Tx, userId: string, id: string, { targetDate, status, timezone }: ResolveHabitAction) {
    const [habit] = await tx
        .select()
        .from(habits)
        .where(and(eq(habits.id, id), eq(habits.userId, userId)));

    throwIfNotFound(habit, "Habit");

    const datePrefix = targetDate.substring(0, 10);
    const now = sql`NOW()`;

    // Upsert by habitId + targetDate (unique constraint handles dedup)
    const [existing] = await tx
        .select()
        .from(habitLogs)
        .where(
            and(
                eq(habitLogs.userId, userId),
                eq(habitLogs.habitId, habit.id),
                eq(habitLogs.targetDate, datePrefix)
            )
        );

    let row;
    if (status === "PENDING" && existing) {
        // Clearing a resolution — delete the log row to avoid noisy PENDING accumulation
        await tx.delete(habitLogs).where(eq(habitLogs.id, existing.id));
        row = { ...existing, status: "PENDING" as const, completedAt: null, resolvedAt: null };
    } else if (existing) {
        [row] = await tx
            .update(habitLogs)
            .set({
                status,
                completedAt: status === "COMPLETED" ? now : null,
                resolvedAt: now,
            })
            .where(eq(habitLogs.id, existing.id))
            .returning();
    } else if (status !== "PENDING") {
        [row] = await tx
            .insert(habitLogs)
            .values({
                userId,
                habitId: habit.id,
                targetDate: datePrefix,
                status,
                completedAt: status === "COMPLETED" ? now : null,
                resolvedAt: now,
            })
            .returning();
    } else {
        // PENDING with no existing log — no-op
        row = { id: `virt_${datePrefix}`, habitId: habit.id, userId, status: "PENDING" as const, targetDate: datePrefix, completedAt: null, resolvedAt: null, createdAt: new Date().toISOString() };
    }

    // Incremental completions and skips computation (O(1))
    let totalCompletionsDelta = 0;
    let totalSkipsDelta = 0;

    if (status === "PENDING" && existing) {
        if (existing.status === "COMPLETED") totalCompletionsDelta = -1;
        if (existing.status === "SKIPPED") totalSkipsDelta = -1;
    } else if (existing) {
        if (existing.status !== status) {
            if (existing.status === "COMPLETED") {
                totalCompletionsDelta = -1;
                if (status === "SKIPPED") totalSkipsDelta = 1;
            } else if (existing.status === "SKIPPED") {
                totalSkipsDelta = -1;
                if (status === "COMPLETED") totalCompletionsDelta = 1;
            }
        }
    } else if (status !== "PENDING") {
        if (status === "COMPLETED") totalCompletionsDelta = 1;
        if (status === "SKIPPED") totalSkipsDelta = 1;
    }

    const totalCompletions = Math.max(0, habit.totalCompletions + totalCompletionsDelta);
    const totalSkips = Math.max(0, habit.totalSkips + totalSkipsDelta);

    // Determine whether `datePrefix` is the most recent occurrence on or
    // before the caller's today. The log mutation above is visible inside
    // this tx, so both streak paths read the post-mutation state.
    const tz = resolveTimeZone(timezone);
    const todayStr = toLocalDateStr(new Date(), tz);
    const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
    const targetEnd = new Date(`${datePrefix}T23:59:59.999Z`);
    const occurrencesAfter = targetEnd < todayEnd
        ? expandOccurrences(habit.recurrenceRule, habit.createdAt, new Date(targetEnd.getTime() + 1000), todayEnd, tz)
        : [];
    const isMostRecentActive = occurrencesAfter.length === 0;

    let currentStreak: number;
    let longestStreak: number;

    if (isMostRecentActive) {
        // Hot path: bounded backward walk from today (O(streak), not O(history)).
        // Correct for completes, un-completes, skips, and any recurrence cadence.
        const [{ earliest }] = await tx
            .select({ earliest: min(habitLogs.targetDate) })
            .from(habitLogs)
            .where(and(eq(habitLogs.userId, userId), eq(habitLogs.habitId, habit.id), eq(habitLogs.status, "COMPLETED")));
        currentStreak = await computeCurrentStreak(
            habit.recurrenceRule,
            habit.createdAt,
            todayStr,
            (dates) => loadResolvedOccurrenceDates(tx, habit.id, userId, dates),
            { timeZone: tz, earliest },
        );
        // Longest streak is a monotonic high-water mark; it never shrinks.
        longestStreak = Math.max(habit.longestStreak, currentStreak);
    } else {
        // Historical/backfill resolution — recompute from full history so an
        // edited past occurrence can re-join or split older runs correctly.
        const allLogs = await tx
            .select({ targetDate: habitLogs.targetDate, status: habitLogs.status })
            .from(habitLogs)
            .where(and(eq(habitLogs.habitId, habit.id), eq(habitLogs.userId, userId)));

        // From the creation day, or the oldest log when one predates it.
        const firstDay = allLogs.reduce((first, log) => log.targetDate < first ? log.targetDate : first, localDay(habit.createdAt, tz));
        const allOccurrences = expandOccurrences(habit.recurrenceRule, habit.createdAt, new Date(`${firstDay}T00:00:00.000Z`), todayEnd, tz);

        const streakData = recomputeStreaks(allLogs, allOccurrences);
        currentStreak = streakData.currentStreak;
        longestStreak = Math.max(habit.longestStreak, streakData.longestStreak);
    }

    const [updatedHabit] = await tx
        .update(habits)
        .set({
            totalCompletions,
            totalSkips,
            currentStreak,
            longestStreak,
            updatedAt: now,
        })
        .where(eq(habits.id, habit.id))
        .returning();

    return { habit: updatedHabit, log: row };
}
