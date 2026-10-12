import { eq, and, or, ne, lt, lte, isNull, sql, gte, count, avg, inArray } from "drizzle-orm";
import { type DbClient } from "./db";
import type { Tx } from "../types/db";
import { withRls } from "./rls";
import { tasks, taskMetrics, usageEvents, userMetrics, habitLogs, habits } from "../db/schema";
import { habitDays } from "@cadence/domain/repeats";
import { addDays, dayOf, startOfDay, todayIn, type LocalDate, type Zone } from "@cadence/domain/time";
import { logger, hashIdentifier, issuesFromError } from "./log";
import { userZone } from "./user-zone";

/** Count one reschedule per task, in one upsert. `firstScheduled` is the task's new day. */
export async function trackReschedules(
    db: DbClient,
    userId: string,
    rescheduled: { taskId: string; scheduledStart: string | null; dueDate: string | null }[],
) {
    await withRls(db, userId, async (tx) => {
        const zone = await userZone(tx, userId);
        await tx
            .insert(taskMetrics)
            .values(rescheduled.map(({ taskId, scheduledStart, dueDate }) => ({
                taskId,
                userId,
                rescheduleCount: 1,
                firstScheduled: scheduledStart ? dayOf(scheduledStart, zone) : dueDate,
                lastRescheduledAt: new Date().toISOString(),
            })))
            .onConflictDoUpdate({
                target: taskMetrics.taskId,
                set: {
                    rescheduleCount: sql`${taskMetrics.rescheduleCount} + 1`,
                    firstScheduled: sql`coalesce(${taskMetrics.firstScheduled}, excluded.first_scheduled)`,
                    lastRescheduledAt: sql`excluded.last_rescheduled_at`,
                },
            });
    });
}

/** The overdue predicate: not a series or Fixed block, and its day (due day, else the start's day) is before `today`. */
export function overdueOn(today: LocalDate, zone: Zone) {
    return and(
        isNull(tasks.recurrenceRule),
        ne(tasks.interactionMode, "timetable"),
        or(lt(tasks.dueDate, today), and(isNull(tasks.dueDate), lt(tasks.scheduledStart, startOfDay(today, zone)))),
    )!;
}

/** Record completion for several tasks in one RLS transaction: one read, one upsert. */
export async function trackBatchCompletion(db: DbClient, taskIds: string[], userId: string) {
    await withRls(db, userId, async (tx) => {
        const foundTasks = await tx
            .select({ id: tasks.id, createdAt: tasks.createdAt })
            .from(tasks)
            .where(inArray(tasks.id, taskIds));

        if (foundTasks.length === 0) return;

        const now = new Date().toISOString();
        await tx
            .insert(taskMetrics)
            .values(foundTasks.map((t) => ({
                taskId: t.id,
                userId,
                completedAt: now,
                createdToDone: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000),
            })))
            .onConflictDoUpdate({
                target: taskMetrics.taskId,
                set: { completedAt: sql`excluded.completed_at`, createdToDone: sql`excluded.created_to_done` },
            });
    });
}

/** Batch-insert usage events in a single RLS transaction. */
export async function trackBatchEvents(
    db: DbClient,
    userId: string,
    events: { event: string; metadata?: Record<string, unknown> }[],
) {
    try {
        await withRls(db, userId, async (tx) => {
            await tx.insert(usageEvents).values(
                events.map((e) => ({ userId, event: e.event, metadata: e.metadata ?? null })),
            );
        });
    } catch (err) {
        // Best-effort telemetry — never block the caller, but surface the failure.
        logger.warn("http", "telemetry_write_failed", {
            userHash: await hashIdentifier(userId),
            events: events.length,
            issues: issuesFromError(err),
        });
    }
}

/** Recompute user workload signals from existing data and persist in user_metrics. */
export async function computeWorkloadSignals(db: DbClient, userId: string) {
    await withRls(db, userId, async (tx) => {
        const now = new Date();
        const zone = await userZone(tx, userId);
        const today = todayIn(zone, now);
        const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
        const nowIso = now.toISOString();
        const fourteenDaysAgo = daysAgo(14);
        const sevenDaysAgo = daysAgo(7);

        const [
            reschedule,
            overdue,
            completedCount,
            habit,
            density,
        ] = await Promise.all([
            queryRescheduleVelocity(tx, userId, fourteenDaysAgo, nowIso),
            queryOverdueCarryLoad(tx, userId, today, zone),
            queryCompletedCount(tx, userId, fourteenDaysAgo, nowIso),
            queryHabitAdherenceRate(tx, userId, addDays(today, -14), today, zone),
            queryScheduleDensity(tx, userId, sevenDaysAgo, nowIso),
        ]);

        const denominator = completedCount + overdue.overdue;
        const completionRatio = denominator > 0 ? completedCount / denominator : 0;

        // A signal with no underlying rows is unknown, not zero — it carries no penalty.
        const burnoutIndex = computeBurnoutIndex({
            rescheduleVelocity: reschedule.rows > 0 ? reschedule.value : null,
            overdueCarryLoad: overdue.active > 0 ? overdue.overdue : null,
            completionRatio: denominator > 0 ? completionRatio : null,
            habitAdherenceRate: habit.logs > 0 ? habit.rate : null,
            scheduleDensity: density.blocks > 0 ? density.minutesPerDay : null,
        });

        const data = {
            rescheduleVelocity: reschedule.value,
            currentBurnoutIndex: burnoutIndex,
            completionRatio,
            overdueCarryLoad: overdue.overdue,
            habitAdherenceRate: habit.rate,
            scheduleDensity: density.minutesPerDay,
            lastCalculatedAt: now.toISOString(),
        };
        await tx
            .insert(userMetrics)
            .values({ userId, ...data })
            .onConflictDoUpdate({ target: [userMetrics.userId], set: data });
    });
}

/** Tasks rescheduled within [since, until]; a row from before `lastRescheduledAt` existed has no event time and is left out. */
async function queryRescheduleVelocity(tx: Tx, userId: string, since: string, until: string) {
    const [stats] = await tx
        .select({ avgReschedules: avg(taskMetrics.rescheduleCount), rows: count() })
        .from(taskMetrics)
        .where(and(eq(taskMetrics.userId, userId), gte(taskMetrics.lastRescheduledAt, since), lte(taskMetrics.lastRescheduledAt, until)));
    return { value: parseFloat(String(stats?.avgReschedules ?? "0")), rows: stats?.rows ?? 0 };
}

/** Open one-off tasks whose day is before the user's today, plus how many such tasks exist at all (evidence coverage). */
async function queryOverdueCarryLoad(tx: Tx, userId: string, today: LocalDate, zone: Zone) {
    const countable = and(isNull(tasks.recurrenceRule), ne(tasks.interactionMode, "timetable"));
    const [stats] = await tx
        .select({
            overdue: sql<number>`COUNT(*) FILTER (WHERE ${overdueOn(today, zone)})`,
            active: sql<number>`COUNT(*) FILTER (WHERE ${countable})`,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.state, "ACTIVE")));
    return { overdue: Number(stats?.overdue ?? 0), active: Number(stats?.active ?? 0) };
}

/** Completions that happened within [since, until], by when they were completed. */
async function queryCompletedCount(tx: Tx, userId: string, since: string, until: string) {
    const [stats] = await tx
        .select({ cnt: count() })
        .from(taskMetrics)
        .where(and(eq(taskMetrics.userId, userId), gte(taskMetrics.completedAt, since), lte(taskMetrics.completedAt, until)));
    return stats?.cnt ?? 0;
}

/**
 * Routine days from `since` up to yesterday, as Routines counts them: every due day, done or left open.
 * A skip is a choice, not a miss, so it leaves the denominator; today is still open and counts nowhere.
 */
async function queryHabitAdherenceRate(tx: Tx, userId: string, since: LocalDate, today: LocalDate, zone: Zone) {
    const yesterday = addDays(today, -1);
    const [routines, logs] = await Promise.all([
        tx.select({ id: habits.id, recurrenceRule: habits.recurrenceRule, createdAt: habits.createdAt, pausedUntil: habits.pausedUntil })
            .from(habits).where(eq(habits.userId, userId)),
        tx.select({ habitId: habitLogs.habitId, targetDate: habitLogs.targetDate, status: habitLogs.status })
            .from(habitLogs).where(and(eq(habitLogs.userId, userId), gte(habitLogs.targetDate, since), lte(habitLogs.targetDate, yesterday))),
    ]);
    const byRoutine = new Map<string, Map<string, { targetDate: string; status: string }>>();
    for (const log of logs) {
        if (!byRoutine.has(log.habitId)) byRoutine.set(log.habitId, new Map());
        byRoutine.get(log.habitId)!.set(log.targetDate, log);
    }
    let completed = 0;
    let total = 0;
    for (const routine of routines) {
        for (const { log } of habitDays(routine, byRoutine.get(routine.id) ?? new Map(), since, yesterday, zone, today)) {
            if (log?.status === "SKIPPED") continue;
            total++;
            if (log?.status === "COMPLETED") completed++;
        }
    }
    return { rate: total > 0 ? completed / total : 0, logs: total };
}

/** Timed blocks that started within [since, until]: the load already carried, not what is planned ahead. */
async function queryScheduleDensity(tx: Tx, userId: string, since: string, until: string) {
    const [stats] = await tx
        .select({
            totalMinutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${tasks.scheduledEnd} - ${tasks.scheduledStart})) / 60), 0)`,
            blocks: count(),
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), sql`${tasks.scheduledStart} IS NOT NULL`, sql`${tasks.scheduledEnd} IS NOT NULL`, gte(tasks.scheduledStart, since), lte(tasks.scheduledStart, until)));
    return { minutesPerDay: (Number(stats?.totalMinutes) || 0) / 7, blocks: stats?.blocks ?? 0 };
}

/**
 * The heuristic load score from whichever signals actually have evidence. A signal with no
 * rows is unknown and adds nothing; with no evidence at all the score itself is unknown
 * (null) — a new account has no purported stress state.
 */
function computeBurnoutIndex(signals: {
    rescheduleVelocity: number | null;
    overdueCarryLoad: number | null;
    completionRatio: number | null;
    habitAdherenceRate: number | null;
    scheduleDensity: number | null;
}): number | null {
    if (Object.values(signals).every((v) => v === null)) return null;
    let index = 10;
    if (signals.rescheduleVelocity !== null) index += signals.rescheduleVelocity * 8;
    if (signals.overdueCarryLoad !== null) index += signals.overdueCarryLoad * 3;
    if (signals.completionRatio !== null) index += (1 - signals.completionRatio) * 20;
    if (signals.habitAdherenceRate !== null) index += (1 - signals.habitAdherenceRate) * 10;
    if (signals.scheduleDensity !== null) index += signals.scheduleDensity * 0.05;
    return Math.min(100, Math.max(1, Math.round(index)));
}
