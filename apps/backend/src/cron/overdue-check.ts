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

    // Collect unique user IDs affected
    const affectedUserIds = new Set<string>();

    // Increment delay_count for each
    if (overdueTasks.length > 0) {
        for (const task of overdueTasks) {
            affectedUserIds.add(task.userId);
            await withRls(db, task.userId, async (tx) => {
                await tx
                    .insert(taskMetrics)
                    .values({ taskId: task.id, userId: task.userId, delayCount: 0 })
                    .onConflictDoNothing();

                await tx
                    .update(taskMetrics)
                    .set({ delayCount: sql`${taskMetrics.delayCount} + 1` })
                    .where(and(eq(taskMetrics.taskId, task.id), eq(taskMetrics.userId, task.userId)));
            });
        }
    }

    // Recompute workload signals for each affected user
    for (const userId of affectedUserIds) {
        try {
            await computeWorkloadSignals(db, userId);
        } catch {
            // Best-effort — don't block the cron job
        }
    }
}
