import { and, eq, inArray, sql } from "drizzle-orm";
import { rrulestr } from "rrule";
import type { ResolveHabitAction } from "@cadence/contracts/habit";
import { habitOccurrences } from "@cadence/domain/repeats";
import { habits, habitLogs } from "../../db/schema";
import { throwIfNotFound } from "../../platform/errors";
import { toLocalDateStr } from "../../platform/date-utils";
import { logger, shorten, issuesFromError } from "../../platform/log";
import type { Tx } from "../../types/db";

// ── Utility ───────────────────────────────────────────────────────────

/**
 * Shared recurrence expansion — single source of truth.
 * Anchors dtstart to midnight UTC of the habit's creation date, then expands
 * within the given [startDate, endDate] window returning YYYY-MM-DD strings.
 */
export function expandOccurrences(recurrenceRule: string, createdAt: string, startDate: Date, endDate: Date): string[] {
    try {
        return habitOccurrences(recurrenceRule, String(createdAt), startDate, endDate);
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
 * Walks backward from the most recent completed date.
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
        } else {
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

/** Load which of the given occurrence dates have a COMPLETED log, as a Set. */
async function loadCompletedOccurrenceDates(
    tx: Tx,
    habitId: string,
    userId: string,
    dates: string[],
): Promise<Set<string>> {
    if (dates.length === 0) return new Set();
    const rows = await tx
        .select({ targetDate: habitLogs.targetDate })
        .from(habitLogs)
        .where(and(
            eq(habitLogs.userId, userId),
            eq(habitLogs.habitId, habitId),
            eq(habitLogs.status, "COMPLETED"),
            inArray(habitLogs.targetDate, dates),
        ));
    return new Set(rows.map((r) => r.targetDate));
}

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
 *  - The first non-completed occurrence *after* the run has started ends it.
 *  - If `leadingLimit` occurrences pass with no completion at all, the streak is
 *    considered broken (0).
 *
 * `terminated` signals the streak is fully determined so the caller can stop
 * fetching further history.
 */
export function scanStreak(
    windowNewestFirst: string[],
    completed: ReadonlySet<string>,
    state: StreakScanState,
    leadingLimit = STREAK_LEADING_LIMIT,
): StreakScanState & { terminated: boolean } {
    let { streak, runStarted, leadingGap } = state;
    for (const date of windowNewestFirst) {
        if (completed.has(date)) {
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
 * `loadCompleted` is injected (rather than taking a `tx`) so the streak logic is
 * pure of persistence concerns and unit-testable with real recurrence rules.
 */
export async function computeCurrentStreak(
    recurrenceRule: string,
    createdAt: string,
    asOfDateStr: string,
    loadCompleted: (dates: string[]) => Promise<ReadonlySet<string>>,
): Promise<number> {
    let rule: ReturnType<typeof rrulestr>;
    try {
        const dtstart = new Date(`${String(createdAt).substring(0, 10)}T00:00:00.000Z`);
        rule = rrulestr(recurrenceRule, { dtstart });
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

        const completed = await loadCompleted(window);
        const result = scanStreak(window, completed, state);
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
export async function resolveHabit(tx: Tx, userId: string, id: string, { targetDate, status }: ResolveHabitAction) {
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
    // before today. The log mutation above is visible inside this tx, so
    // both streak paths read the post-mutation state.
    const todayUtcStr = toLocalDateStr(new Date(), "UTC");
    const todayEnd = new Date(`${todayUtcStr}T23:59:59.999Z`);
    const targetEnd = new Date(`${datePrefix}T23:59:59.999Z`);
    const occurrencesAfter = targetEnd < todayEnd
        ? expandOccurrences(habit.recurrenceRule, habit.createdAt, new Date(targetEnd.getTime() + 1000), todayEnd)
        : [];
    const isMostRecentActive = occurrencesAfter.length === 0;

    let currentStreak: number;
    let longestStreak: number;

    if (isMostRecentActive) {
        // Hot path: bounded backward walk from today (O(streak), not O(history)).
        // Correct for completes, un-completes, skips, and any recurrence cadence.
        currentStreak = await computeCurrentStreak(
            habit.recurrenceRule,
            habit.createdAt,
            todayUtcStr,
            (dates) => loadCompletedOccurrenceDates(tx, habit.id, userId, dates),
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

        const totalExpansionStart = new Date(`${String(habit.createdAt).substring(0, 10)}T00:00:00.000Z`);
        const allOccurrences = expandOccurrences(habit.recurrenceRule, habit.createdAt, totalExpansionStart, todayEnd);

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
