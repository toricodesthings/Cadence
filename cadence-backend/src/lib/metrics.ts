import { eq, and, sql } from "drizzle-orm";
import { type DbClient } from "./db";
import { tasks, taskMetrics } from "../db/schema";

export async function trackReschedule(
    db: DbClient,
    taskId: string,
    userId: string,
    newScheduledStart: string | null,
) {
    // Upsert into task_metrics
    const existing = await db
        .select()
        .from(taskMetrics)
        .where(and(eq(taskMetrics.taskId, taskId), eq(taskMetrics.userId, userId)))
        .limit(1);

    if (existing.length === 0) {
        await db.insert(taskMetrics).values({
            taskId,
            userId,
            rescheduleCount: 1,
            firstScheduled: newScheduledStart,
        });
    } else {
        await db
            .update(taskMetrics)
            .set({
                rescheduleCount: sql`${taskMetrics.rescheduleCount} + 1`,
                firstScheduled: existing[0].firstScheduled ?? newScheduledStart,
            })
            .where(eq(taskMetrics.id, existing[0].id));
    }
}

export async function trackCompletion(
    db: DbClient,
    taskId: string,
    userId: string,
) {
    const task = await db
        .select({ createdAt: tasks.createdAt })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

    if (!task[0]) return;

    const createdToDone = Math.floor(
        (Date.now() - new Date(task[0].createdAt).getTime()) / 1000,
    );

    await db
        .insert(taskMetrics)
        .values({
            taskId,
            userId,
            completedAt: new Date().toISOString(),
            createdToDone,
        })
        .onConflictDoNothing(); // If metrics row already exists from reschedule tracking

    // If row exists, update it instead
    await db
        .update(taskMetrics)
        .set({
            completedAt: new Date().toISOString(),
            createdToDone,
        })
        .where(and(eq(taskMetrics.taskId, taskId), eq(taskMetrics.userId, userId)));
}
