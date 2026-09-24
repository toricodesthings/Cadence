import { eq, and, sql, gte, count, avg, inArray } from "drizzle-orm";
import { type DbClient } from "./db";
import type { Tx } from "../types/db";
import { withRls } from "./rls";
import { tasks, taskMetrics, usageEvents, userMetrics, habitLogs } from "../db/schema";
import { logger, hashIdentifier, issuesFromError } from "./log";

/** Count one reschedule per task, in one upsert. `at` is the task's new date. */
export async function trackReschedules(
    db: DbClient,
    userId: string,
    rescheduled: { taskId: string; at: string | null }[],
) {
    await withRls(db, userId, (tx) =>
        tx
            .insert(taskMetrics)
            .values(rescheduled.map(({ taskId, at }) => ({ taskId, userId, rescheduleCount: 1, firstScheduled: at })))
            .onConflictDoUpdate({
                target: taskMetrics.taskId,
                set: {
                    rescheduleCount: sql`${taskMetrics.rescheduleCount} + 1`,
                    firstScheduled: sql`coalesce(${taskMetrics.firstScheduled}, excluded.first_scheduled)`,
                },
            }),
    );
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

        const data = {
            rescheduleVelocity,
            currentBurnoutIndex: burnoutIndex,
            completionRatio,
            overdueCarryLoad,
            habitAdherenceRate,
            scheduleDensity,
            lastCalculatedAt: now.toISOString(),
        };
        await tx
            .insert(userMetrics)
            .values({ userId, ...data })
            .onConflictDoUpdate({ target: [userMetrics.userId], set: data });
    });
}

async function queryRescheduleVelocity(tx: Tx, userId: string, since: string) {
    const [stats] = await tx
        .select({ avgReschedules: avg(taskMetrics.rescheduleCount) })
        .from(taskMetrics)
        .where(and(eq(taskMetrics.userId, userId), gte(taskMetrics.createdAt, since)));
    return parseFloat(String(stats?.avgReschedules ?? "0"));
}

async function queryOverdueCarryLoad(tx: Tx, userId: string) {
    const [stats] = await tx
        .select({ cnt: count() })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.state, "ACTIVE"), sql`${tasks.dueDate} < NOW()`));
    return stats?.cnt ?? 0;
}

async function queryCompletedCount(tx: Tx, userId: string, since: string) {
    const [stats] = await tx
        .select({ cnt: count() })
        .from(taskMetrics)
        .where(and(eq(taskMetrics.userId, userId), sql`${taskMetrics.completedAt} IS NOT NULL`, gte(taskMetrics.createdAt, since)));
    return stats?.cnt ?? 0;
}

async function queryHabitAdherenceRate(tx: Tx, userId: string, since: string) {
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

async function queryScheduleDensity(tx: Tx, userId: string, since: string) {
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
