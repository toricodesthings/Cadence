import { eq, and, lt, sql, inArray, isNull, or } from "drizzle-orm";
import { getDbClient } from "../platform/db";
import { tasks, taskMetrics, mutationDedup, aiMemories, aiImages } from "../db/schema";
import { aiImageKey, deleteImageObjects, IMAGE_RETENTION_DAYS, ORPHAN_HOURS } from "../domains/ai/images/chat-images";
import { withRls } from "../platform/rls";
import { computeWorkloadSignals } from "../platform/metrics";
import { logger, hashIdentifier, issuesFromError } from "../platform/log";
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

    logger.info("cron", "overdue_check_started", {
        tasks: overdueTasks.length,
        users: tasksByUser.size,
    });

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
            logger.error("cron", "workload_recompute_failed", {
                userHash: await hashIdentifier(userId),
                issues: issuesFromError(err),
            });
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
        logger.info("cron", "mutation_dedup_pruned", { pruned: deleted.length });
    }
}

/**
 * Auto-prune the AI memory layer (doc 06 §6). Deletes EXPIRED EPHEMERAL memories
 * only — CORE memories are NEVER pruned automatically. Bounded to a capped batch
 * per run to keep the pgvector index high-signal and cheap. Cron runs as table
 * owner (intentionally bypasses RLS to sweep all users), mirroring handleOverdueCheck.
 */
export async function pruneAiMemories(env: Env) {
    const db = getDbClient(env);
    const now = new Date().toISOString();
    const BATCH = 500;

    const idsToDelete = await db
        .select({ id: aiMemories.id })
        .from(aiMemories)
        .where(and(eq(aiMemories.type, "EPHEMERAL"), lt(aiMemories.expiresAt, now)))
        .limit(BATCH);

    if (idsToDelete.length === 0) return;

    const deleted = await db
        .delete(aiMemories)
        .where(inArray(aiMemories.id, idsToDelete.map((r) => r.id)))
        .returning({ id: aiMemories.id });

    logger.info("cron", "memory_prune_summary", { pruned: deleted.length });
}

/**
 * Chat image retention: deletes images attached but never sent (older than a
 * day) and images unused for 30 days. R2 lifecycle rules count from upload, not
 * last use, so this sweep is the rule. Storage goes before rows, so a failed
 * delete leaves the row for the next run. Cron runs as table owner (sweeps all users).
 */
export async function pruneAiImages(env: Env) {
    const bucket = env.USER_ASSETS;
    if (!bucket) return;
    const db = getDbClient(env);
    const BATCH = 1000;
    const orphanCutoff = new Date(Date.now() - ORPHAN_HOURS * 60 * 60 * 1000).toISOString();
    const idleCutoff = new Date(Date.now() - IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let pruned = 0;
    for (;;) {
        const rows = await db
            .select({ id: aiImages.id, userId: aiImages.userId })
            .from(aiImages)
            .where(
                or(
                    and(isNull(aiImages.sentAt), lt(aiImages.createdAt, orphanCutoff)),
                    lt(aiImages.lastUsedAt, idleCutoff),
                ),
            )
            .limit(BATCH);
        if (rows.length === 0) break;

        const userKeys = new Map<string, string>();
        for (const { userId } of rows) {
            if (!userKeys.has(userId)) userKeys.set(userId, await hashIdentifier(userId));
        }
        await deleteImageObjects(bucket, rows.map((row) => aiImageKey(userKeys.get(row.userId)!, row.id)));
        await db.delete(aiImages).where(inArray(aiImages.id, rows.map((row) => row.id)));
        pruned += rows.length;
        if (rows.length < BATCH) break;
    }

    if (pruned > 0) logger.info("cron", "ai_image_prune_summary", { pruned });
}
