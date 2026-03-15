import { eq, and, lt, sql } from "drizzle-orm";
import { getDbClient } from "../lib/db";
import { tasks, taskMetrics } from "../db/schema";
import { withRls } from "../lib/rls";
import { computeWorkloadSignals } from "../lib/metrics";
import type { Env } from "../types/env";

export async function handleOverdueCheck(env: Env) {
    const db = getDbClient(env);
    const now = new Date().toISOString();

    // Find all tasks that are overdue and still ACTIVE
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
            for (const taskId of taskIds) {
                await tx
                    .insert(taskMetrics)
                    .values({ taskId, userId, delayCount: 0 })
                    .onConflictDoNothing();

                await tx
                    .update(taskMetrics)
                    .set({ delayCount: sql`${taskMetrics.delayCount} + 1` })
                    .where(and(eq(taskMetrics.taskId, taskId), eq(taskMetrics.userId, userId)));
            }
        });

        try {
            await computeWorkloadSignals(db, userId);
        } catch (err) {
            console.error(`Failed to recompute workload signals for user ${userId}:`, err);
        }
    }
}
