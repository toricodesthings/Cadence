import { eq, and, sql } from "drizzle-orm";
import { type DbClient } from "./db";
import { withRls } from "./rls";
import { tasks, taskMetrics } from "../db/schema";

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
