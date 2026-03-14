import { eq, and, sql, gte, count, avg } from "drizzle-orm";
import { type DbClient } from "./db";
import { withRls } from "./rls";
import { tasks, taskMetrics, usageEvents, userMetrics, habitLogs } from "../db/schema";

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

/** Recompute user workload signals from existing data and persist in user_metrics. */
export async function computeWorkloadSignals(db: DbClient, userId: string) {
    await withRls(db, userId, async (tx) => {
        const now = new Date();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Reschedule velocity: avg reschedule_count over tasks touched in last 14 days
        const [rescheduleStats] = await tx
            .select({ avgReschedules: avg(taskMetrics.rescheduleCount) })
            .from(taskMetrics)
            .where(and(eq(taskMetrics.userId, userId), gte(taskMetrics.createdAt, fourteenDaysAgo)));
        const rescheduleVelocity = parseFloat(String(rescheduleStats?.avgReschedules ?? "0"));

        // Overdue carry load: count of currently overdue ACTIVE tasks
        const [overdueStats] = await tx
            .select({ cnt: count() })
            .from(tasks)
            .where(
                and(
                    eq(tasks.userId, userId),
                    eq(tasks.state, "ACTIVE"),
                    sql`${tasks.dueDate} < NOW()`,
                ),
            );
        const overdueCarryLoad = overdueStats?.cnt ?? 0;

        // Completion ratio: completed / (completed + currently overdue) in last 14 days
        const [completedStats] = await tx
            .select({ cnt: count() })
            .from(taskMetrics)
            .where(
                and(
                    eq(taskMetrics.userId, userId),
                    sql`${taskMetrics.completedAt} IS NOT NULL`,
                    gte(taskMetrics.createdAt, fourteenDaysAgo),
                ),
            );
        const completed = completedStats?.cnt ?? 0;
        const completionDenominator = completed + overdueCarryLoad;
        const completionRatio = completionDenominator > 0 ? completed / completionDenominator : 0;

        // Habit adherence: completed / (completed + skipped) in last 14 days
        const [habitCompleted] = await tx
            .select({ cnt: count() })
            .from(habitLogs)
            .where(
                and(
                    eq(habitLogs.userId, userId),
                    eq(habitLogs.status, "COMPLETED"),
                    gte(habitLogs.createdAt, fourteenDaysAgo),
                ),
            );
        const [habitSkipped] = await tx
            .select({ cnt: count() })
            .from(habitLogs)
            .where(
                and(
                    eq(habitLogs.userId, userId),
                    eq(habitLogs.status, "SKIPPED"),
                    gte(habitLogs.createdAt, fourteenDaysAgo),
                ),
            );
        const hCompleted = habitCompleted?.cnt ?? 0;
        const hSkipped = habitSkipped?.cnt ?? 0;
        const habitTotal = hCompleted + hSkipped;
        const habitAdherenceRate = habitTotal > 0 ? hCompleted / habitTotal : 0;

        // Schedule density: avg scheduled minutes per day over 7 days
        const [densityStats] = await tx
            .select({
                totalMinutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${tasks.scheduledEnd} - ${tasks.scheduledStart})) / 60), 0)`,
            })
            .from(tasks)
            .where(
                and(
                    eq(tasks.userId, userId),
                    sql`${tasks.scheduledStart} IS NOT NULL`,
                    sql`${tasks.scheduledEnd} IS NOT NULL`,
                    gte(tasks.scheduledStart, sevenDaysAgo),
                ),
            );
        const scheduleDensity = (Number(densityStats?.totalMinutes) || 0) / 7;

        // Burnout index: composite 1-100 score
        const burnoutIndex = Math.min(
            100,
            Math.max(
                1,
                Math.round(
                    10
                    + rescheduleVelocity * 8
                    + overdueCarryLoad * 3
                    + (1 - completionRatio) * 20
                    + (1 - habitAdherenceRate) * 10
                    + scheduleDensity * 0.05,
                ),
            ),
        );

        // Upsert user_metrics
        const existing = await tx
            .select({ id: userMetrics.id })
            .from(userMetrics)
            .where(eq(userMetrics.userId, userId))
            .limit(1);

        if (existing.length === 0) {
            await tx.insert(userMetrics).values({
                userId,
                rescheduleVelocity,
                currentBurnoutIndex: burnoutIndex,
                completionRatio,
                overdueCarryLoad,
                habitAdherenceRate,
                scheduleDensity,
                lastCalculatedAt: now.toISOString(),
            });
        } else {
            await tx
                .update(userMetrics)
                .set({
                    rescheduleVelocity,
                    currentBurnoutIndex: burnoutIndex,
                    completionRatio,
                    overdueCarryLoad,
                    habitAdherenceRate,
                    scheduleDensity,
                    lastCalculatedAt: now.toISOString(),
                })
                .where(eq(userMetrics.id, existing[0].id));
        }
    });
}
