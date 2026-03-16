import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { tasks, taskMetrics, mutationDedup } from "../db/schema";
import { withRls } from "../lib/rls";
import { computeWorkloadSignals } from "../lib/metrics";
import type { Env } from "../types/env";

export async function handleOverdueCheck(env: Env) {
    const db = getDbClient(env);
    const now = new Date().toISOString();

    // Cron runs as table owner — intentionally bypasses RLS to scan all users' overdue tasks
    const overdueTasks = await db
        .select({ id: tasks.id, userId: tasks.userId })
        .from(tasks)
        .where(and(eq(tasks.state, "ACTIVE"), lt(tasks.dueDate, now)));

    if (overdueTasks.length === 0) return;

    // Group by userId for batched RLS transactions
    const tasksByUser = new Map<string, string[]>();
    for (const task of overdueTasks) {
        const ids = tasksByUser.get(task.userId) ?? [];
        ids.push(task.id);
        tasksByUser.set(task.userId, ids);
    }

    console.info(`Overdue check: ${overdueTasks.length} tasks across ${tasksByUser.size} users`);

    for (const [userId, taskIds] of tasksByUser) {
        await withRls(db, userId, async (tx) => {
            // Batch insert: ensure all metric rows exist in one statement
            await tx
                .insert(taskMetrics)
                .values(taskIds.map((taskId) => ({ taskId, userId, delayCount: 0 })))
                .onConflictDoNothing();

            // Batch update: increment delay count for all overdue tasks at once
            await tx
                .update(taskMetrics)
                .set({ delayCount: sql`${taskMetrics.delayCount} + 1` })
                .where(and(eq(taskMetrics.userId, userId), inArray(taskMetrics.taskId, taskIds)));
        });

        try {
            await computeWorkloadSignals(db, userId);
        } catch (err) {
            console.error(`Failed to recompute workload signals for user ${userId}:`, err);
        }
    }
}

/**
 * Prune stale mutation dedup entries older than 7 days.
 * Safe to run from a cron — prevents unbounded table growth.
 */
export async function pruneStaleMutations(env: Env) {
    const db = getDbClient(env);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const deleted = await db
        .delete(mutationDedup)
        .where(lt(mutationDedup.createdAt, cutoff))
        .returning({ id: mutationDedup.id });

    if (deleted.length > 0) {
        console.info(`Pruned ${deleted.length} stale mutation_dedup entries`);
    }
}
