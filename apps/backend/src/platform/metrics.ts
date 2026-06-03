import { eq, and, sql, gte, count, avg, inArray } from "drizzle-orm";
import { type DbClient } from "./db";
import { withRls } from "./rls";
import { tasks, taskMetrics, usageEvents, userMetrics, habitLogs } from "../db/schema";

type RlsTx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export async function trackReschedule(
    db: DbClient,
    taskId: string,
    userId: string,
    newScheduledStart: string | null,
) {
    await withRls(db, userId, async (tx) => {
        const existing = await tx
            .select()
            .from(taskMetrics)
            .where(and(eq(taskMetrics.taskId, taskId), eq(taskMetrics.userId, userId)))
            .limit(1);

        if (existing.length === 0) {
            await tx.insert(taskMetrics).values({
                taskId,
                userId,
                rescheduleCount: 1,
                firstScheduled: newScheduledStart,
            });
            return;
        }

        await tx
            .update(taskMetrics)
            .set({
                rescheduleCount: sql`${taskMetrics.rescheduleCount} + 1`,
                firstScheduled: existing[0].firstScheduled ?? newScheduledStart,
            })
            .where(eq(taskMetrics.id, existing[0].id));
    });
}

export async function trackCompletion(
    db: DbClient,
    taskId: string,
    userId: string,
) {
    await withRls(db, userId, async (tx) => {
        const task = await tx
            .select({ createdAt: tasks.createdAt })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

        if (!task[0]) return;

        const createdToDone = Math.floor(
            (Date.now() - new Date(task[0].createdAt).getTime()) / 1000,
        );

        await tx
            .insert(taskMetrics)
            .values({
                taskId,
                userId,
                completedAt: new Date().toISOString(),
                createdToDone,
            })
            .onConflictDoNothing();

        await tx
            .update(taskMetrics)
            .set({
                completedAt: new Date().toISOString(),
                createdToDone,
            })
            .where(and(eq(taskMetrics.taskId, taskId), eq(taskMetrics.userId, userId)));
    });
}

/** Fire-and-forget usage event. Safe to call inside waitUntil. */
export async function trackEvent(
    db: DbClient,
    userId: string,
    event: string,
    metadata?: Record<string, unknown>,
) {
    try {
        await withRls(db, userId, async (tx) => {
            await tx.insert(usageEvents).values({
                userId,
                event,
                metadata: metadata ?? null,
            });
        });
    } catch {
        // Best-effort telemetry — never block the caller
    }
}

/**
 * Batch-track completion for multiple tasks in a single RLS transaction.
 * Reduces N DB connections + N transactions → 1 of each.
 */
export async function trackBatchCompletion(db: DbClient, taskIds: string[], userId: string) {
    await withRls(db, userId, async (tx) => {
        const foundTasks = await tx
            .select({ id: tasks.id, createdAt: tasks.createdAt })
            .from(tasks)
            .where(inArray(tasks.id, taskIds));

        if (foundTasks.length === 0) return;

        const now = new Date().toISOString();
        const values = foundTasks.map((t) => ({
            taskId: t.id,
            userId,
            completedAt: now,
            createdToDone: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000),
        }));

        await tx.insert(taskMetrics).values(values).onConflictDoNothing();

        for (const v of values) {
            await tx
                .update(taskMetrics)
                .set({ completedAt: v.completedAt, createdToDone: v.createdToDone })
                .where(and(eq(taskMetrics.taskId, v.taskId), eq(taskMetrics.userId, userId)));
        }
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
    } catch {
        // Best-effort telemetry — never block the caller
    }
}

/** Recompute user workload signals from existing data and persist in user_metrics. */
export async function computeWorkloadSignals(db: DbClient, userId: string) {
    await withRls(db, userId, async (tx) => {
        const now = new Date();
        const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
        const fourteenDaysAgo = daysAgo(14);
        const sevenDaysAgo = daysAgo(7);

        const [
            rescheduleVelocity,
            overdueCarryLoad,
            completedCount,
            habitAdherenceRate,
            scheduleDensity,
        ] = await Promise.all([
            queryRescheduleVelocity(tx, userId, fourteenDaysAgo),
            queryOverdueCarryLoad(tx, userId),
            queryCompletedCount(tx, userId, fourteenDaysAgo),
            queryHabitAdherenceRate(tx, userId, fourteenDaysAgo),
            queryScheduleDensity(tx, userId, sevenDaysAgo),
        ]);

        const denominator = completedCount + overdueCarryLoad;
        const completionRatio = denominator > 0 ? completedCount / denominator : 0;

        const burnoutIndex = computeBurnoutIndex({
            rescheduleVelocity,
            overdueCarryLoad,
            completionRatio,
            habitAdherenceRate,
            scheduleDensity,
        });

        await upsertUserMetrics(tx, userId, {
            rescheduleVelocity,
            currentBurnoutIndex: burnoutIndex,
            completionRatio,
            overdueCarryLoad,
            habitAdherenceRate,
            scheduleDensity,
            lastCalculatedAt: now.toISOString(),
        });
    });
}

async function queryRescheduleVelocity(tx: RlsTx, userId: string, since: string) {
    const [stats] = await tx
        .select({ avgReschedules: avg(taskMetrics.rescheduleCount) })
        .from(taskMetrics)
        .where(and(eq(taskMetrics.userId, userId), gte(taskMetrics.createdAt, since)));
    return parseFloat(String(stats?.avgReschedules ?? "0"));
}

async function queryOverdueCarryLoad(tx: RlsTx, userId: string) {
    const [stats] = await tx
        .select({ cnt: count() })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.state, "ACTIVE"), sql`${tasks.dueDate} < NOW()`));
    return stats?.cnt ?? 0;
}

async function queryCompletedCount(tx: RlsTx, userId: string, since: string) {
    const [stats] = await tx
        .select({ cnt: count() })
        .from(taskMetrics)
        .where(and(eq(taskMetrics.userId, userId), sql`${taskMetrics.completedAt} IS NOT NULL`, gte(taskMetrics.createdAt, since)));
    return stats?.cnt ?? 0;
}

async function queryHabitAdherenceRate(tx: RlsTx, userId: string, since: string) {
    const [stats] = await tx
        .select({
            completed: sql<number>`COUNT(*) FILTER (WHERE ${habitLogs.status} = 'COMPLETED')`,
            total: sql<number>`COUNT(*) FILTER (WHERE ${habitLogs.status} IN ('COMPLETED', 'SKIPPED'))`,
        })
        .from(habitLogs)
        .where(and(eq(habitLogs.userId, userId), gte(habitLogs.targetDate, since.substring(0, 10))));
    const completed = Number(stats?.completed ?? 0);
    const total = Number(stats?.total ?? 0);
    return total > 0 ? completed / total : 0;
}

async function queryScheduleDensity(tx: RlsTx, userId: string, since: string) {
    const [stats] = await tx
        .select({
            totalMinutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${tasks.scheduledEnd} - ${tasks.scheduledStart})) / 60), 0)`,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), sql`${tasks.scheduledStart} IS NOT NULL`, sql`${tasks.scheduledEnd} IS NOT NULL`, gte(tasks.scheduledStart, since)));
    return (Number(stats?.totalMinutes) || 0) / 7;
}

function computeBurnoutIndex(signals: {
    rescheduleVelocity: number;
    overdueCarryLoad: number;
    completionRatio: number;
    habitAdherenceRate: number;
    scheduleDensity: number;
}) {
    return Math.min(
        100,
        Math.max(
            1,
            Math.round(
                10
                + signals.rescheduleVelocity * 8
                + signals.overdueCarryLoad * 3
                + (1 - signals.completionRatio) * 20
                + (1 - signals.habitAdherenceRate) * 10
                + signals.scheduleDensity * 0.05,
            ),
        ),
    );
}

async function upsertUserMetrics(tx: RlsTx, userId: string, data: {
    rescheduleVelocity: number;
    currentBurnoutIndex: number;
    completionRatio: number;
    overdueCarryLoad: number;
    habitAdherenceRate: number;
    scheduleDensity: number;
    lastCalculatedAt: string;
}) {
    await tx
        .insert(userMetrics)
        .values({ userId, ...data })
        .onConflictDoUpdate({
            target: [userMetrics.userId],
            set: data,
        });
}
