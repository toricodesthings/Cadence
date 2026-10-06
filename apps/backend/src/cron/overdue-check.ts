import { eq, and, lt, sql, inArray, isNull, or } from "drizzle-orm";
import { todayIn } from "@cadence/domain/time";
import { getDbClient, type DbClient } from "../platform/db";
import { tasks, taskMetrics, mutationDedup, aiMemories, aiImages, usageEvents } from "../db/schema";
import { aiImageKey, deleteImageObjects, IMAGE_RETENTION_DAYS, ORPHAN_HOURS } from "../domains/ai/images/chat-images";
import { withRls } from "../platform/rls";
import { computeWorkloadSignals, overdueOn } from "../platform/metrics";
import { userZone } from "../platform/user-zone";
import { logger, hashIdentifier, issuesFromError } from "../platform/log";
import type { Env } from "../types/env";
import type { Tx } from "../types/db";

/** The hour (local) at which a user's day turns over for Cadence: between midnight and 4am still counts as "tonight". */
export const DAY_BOUNDARY_HOUR = 4;

/**
 * The Worker's role is under RLS, so the cron can't scan every user's rows. `cron_user_ids` (SECURITY DEFINER,
 * ids only) lists the users, and each job runs per user through `withRls`. `localHour` keeps users whose
 * local hour at `now` is that hour.
 */
async function cronUserIds(db: DbClient, now: Date, localHour: number | null = null): Promise<string[]> {
    const rows = await db
        .select({ id: sql<string>`u.id` })
        .from(sql`cron_user_ids(${now.toISOString()}::timestamptz, ${localHour}::int) AS u(id)`);
    return rows.map((row) => row.id);
}

// ponytail: one transaction per user per job; batch users into one function call if the user count makes the cron slow.
async function forEachUser(db: DbClient, userIds: string[], fn: (tx: Tx, userId: string) => Promise<number>) {
    let total = 0;
    for (const userId of userIds) total += await withRls(db, userId, (tx) => fn(tx, userId));
    return total;
}

/**
 * Hourly. Each user is handled once per local day: on the run that falls in their 04:00 hour
 * (every zone has exactly one such hour a day, DST or not). Overdue = open, not repeating, not
 * Fixed, and its day is before the user's today.
 */
export async function handleOverdueCheck(env: Env, now: Date = new Date()) {
    const db = getDbClient(env);
    let overdueTasks = 0;
    let overdueUsers = 0;

    for (const userId of await cronUserIds(db, now, DAY_BOUNDARY_HOUR)) {
        // One upsert: a first delay creates the metrics row, later ones count up.
        const delayed = await withRls(db, userId, async (tx) => {
            const zone = await userZone(tx, userId);
            const overdue = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.userId, userId), eq(tasks.state, "ACTIVE"), overdueOn(todayIn(zone, now), zone)));
            if (overdue.length === 0) return 0;
            await tx
                .insert(taskMetrics)
                .values(overdue.map(({ id: taskId }) => ({ taskId, userId, delayCount: 1 })))
                .onConflictDoUpdate({
                    target: taskMetrics.taskId,
                    set: { delayCount: sql`${taskMetrics.delayCount} + 1` },
                });
            return overdue.length;
        });
        if (delayed === 0) continue;
        overdueTasks += delayed;
        overdueUsers += 1;

        try {
            await computeWorkloadSignals(db, userId);
        } catch (err) {
            logger.error("cron", "workload_recompute_failed", {
                userHash: await hashIdentifier(userId),
                issues: issuesFromError(err),
            });
        }
    }
    return { overdueTasks, overdueUsers };
}

/**
 * Prune stale mutation dedup entries older than 7 days.
 * Safe to run from a cron — prevents unbounded table growth.
 */
export async function pruneStaleMutations(env: Env, now: Date = new Date()) {
    const db = getDbClient(env);
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    return forEachUser(db, await cronUserIds(db, now), async (tx, userId) => {
        const deleted = await tx
            .delete(mutationDedup)
            .where(and(eq(mutationDedup.userId, userId), lt(mutationDedup.createdAt, cutoff)))
            .returning({ id: mutationDedup.id });
        return deleted.length;
    });
}

export const USAGE_EVENT_RETENTION_DAYS = 90;

/** Deletes usage diagnostics older than the retention window, so the table stays ~90 days per user. */
export async function pruneUsageEvents(env: Env, now: Date = new Date()) {
    const db = getDbClient(env);
    const cutoff = new Date(now.getTime() - USAGE_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    return forEachUser(db, await cronUserIds(db, now), async (tx, userId) => {
        const deleted = await tx
            .delete(usageEvents)
            .where(and(eq(usageEvents.userId, userId), lt(usageEvents.createdAt, cutoff)))
            .returning({ id: usageEvents.id });
        return deleted.length;
    });
}

/**
 * Auto-prune the AI memory layer (doc 06 §6). Deletes EXPIRED EPHEMERAL memories
 * only — CORE memories are NEVER pruned automatically.
 */
export async function pruneAiMemories(env: Env, now: Date = new Date()) {
    const db = getDbClient(env);
    const instant = now.toISOString();

    return forEachUser(db, await cronUserIds(db, now), async (tx, userId) => {
        const deleted = await tx
            .delete(aiMemories)
            .where(and(eq(aiMemories.userId, userId), eq(aiMemories.type, "EPHEMERAL"), lt(aiMemories.expiresAt, instant)))
            .returning({ id: aiMemories.id });
        return deleted.length;
    });
}

/**
 * Chat image retention: deletes images attached but never sent (older than a
 * day) and images unused for 30 days. R2 lifecycle rules count from upload, not
 * last use, so this sweep is the rule. Storage goes before rows, so a failed
 * delete leaves the row for the next run.
 */
export async function pruneAiImages(env: Env, now: Date = new Date()) {
    const bucket = env.USER_ASSETS;
    if (!bucket) return 0;
    const db = getDbClient(env);
    const orphanCutoff = new Date(now.getTime() - ORPHAN_HOURS * 60 * 60 * 1000).toISOString();
    const idleCutoff = new Date(now.getTime() - IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    return forEachUser(db, await cronUserIds(db, now), async (tx, userId) => {
        const rows = await tx
            .select({ id: aiImages.id })
            .from(aiImages)
            .where(and(
                eq(aiImages.userId, userId),
                or(
                    and(isNull(aiImages.sentAt), lt(aiImages.createdAt, orphanCutoff)),
                    lt(aiImages.lastUsedAt, idleCutoff),
                ),
            ));
        if (rows.length === 0) return 0;
        const userKey = await hashIdentifier(userId);
        await deleteImageObjects(bucket, rows.map((row) => aiImageKey(userKey, row.id)));
        await tx.delete(aiImages).where(and(eq(aiImages.userId, userId), inArray(aiImages.id, rows.map((row) => row.id))));
        return rows.length;
    });
}

/** Pruning is a calendar-free retention sweep: it runs once a day, on the 06:00 UTC tick of the hourly cron. */
const PRUNE_HOUR_UTC = 6;

/** The hourly cron: the overdue sweep every run, the prunes on one run a day. Every job runs even if another fails; one `cron_summary` line reports them all. */
export async function runHourlyCron(env: Env, now: Date = new Date()) {
    const prune = now.getUTCHours() === PRUNE_HOUR_UTC;
    const skipped = Promise.resolve(undefined);
    const [overdue, mutations, memories, images, usage] = await Promise.allSettled([
        handleOverdueCheck(env, now),
        prune ? pruneStaleMutations(env, now) : skipped,
        prune ? pruneAiMemories(env, now) : skipped,
        prune ? pruneAiImages(env, now) : skipped,
        prune ? pruneUsageEvents(env, now) : skipped,
    ]);
    const ok = <T>(result: PromiseSettledResult<T>) => (result.status === "fulfilled" ? result.value : undefined);
    const failed = Object.entries({ overdue, mutations, memories, images, usage }).filter(([, r]) => r.status === "rejected");
    for (const [job, result] of failed) {
        logger.error("cron", "cron_job_failed", { job, issues: issuesFromError((result as PromiseRejectedResult).reason) });
    }
    logger.info("cron", "cron_summary", {
        ...ok(overdue),
        prunedMutations: ok(mutations),
        prunedMemories: ok(memories),
        prunedImages: ok(images),
        prunedUsageEvents: ok(usage),
        failed: failed.length,
    });
}
