import { eq, and, lt, sql, inArray, isNull, or } from "drizzle-orm";
import { getDbClient, type DbClient } from "../platform/db";
import { mutationDedup, aiImages, usageEvents } from "../db/schema";
import { nightlyForUser } from "../domains/ai/memory/nightly";
import { sendMemoryMessages } from "../domains/ai/memory/queue";
import { aiImageKey, deleteImageObjects, IMAGE_RETENTION_DAYS, ORPHAN_HOURS } from "../domains/ai/images/chat-images";
import { withRls } from "../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../platform/log";
import { runMemoryJob } from "../domains/ai/memory/memory-job";
import type { Env } from "../types/env";
import type { Tx } from "../types/db";

/**
 * The Worker's role is under RLS, so the cron can't scan every user's rows. `cron_user_ids` (SECURITY DEFINER,
 * ids only) lists the users, and each job runs per user through `withRls`.
 */
async function cronUserIds(db: DbClient, now: Date): Promise<string[]> {
    const rows = await db
        .select({ id: sql<string>`u.id` })
        .from(sql`cron_user_ids(${now.toISOString()}::timestamptz, NULL::int) AS u(id)`);
    return rows.map((row) => row.id);
}

// ponytail: one transaction per user per job; batch users into one function call if the user count makes the cron slow.
async function forEachUser(db: DbClient, userIds: string[], fn: (tx: Tx, userId: string) => Promise<number>) {
    let total = 0;
    for (const userId of userIds) total += await withRls(db, userId, (tx) => fn(tx, userId));
    return total;
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
 * The nightly memory pass, once per person, in the daily run. Forgotten facts are reduced to a label
 * by their own delayed `scrub` message, not here.
 */
export async function runMemoryNightly(env: Env, now: Date = new Date()) {
    const db = getDbClient(env);
    const userIds = await cronUserIds(db, now);
    // With a queue each person is their own message; the consumer logs the changes (`memory_queue`). Sent a chunk a
    // minute, so a chat's `learn` never waits behind everyone's nightly pass (the gaps are too short for Neon to sleep).
    // ponytail: queue delays cap at 12 h, so this spreads at most 720 chunks (18k people); past that, grow the chunk.
    if (env.MEMORY_QUEUE) {
        for (let i = 0; i * NIGHTLY_CHUNK < userIds.length; i++) {
            const chunk = userIds.slice(i * NIGHTLY_CHUNK, (i + 1) * NIGHTLY_CHUNK).map((userId) => ({ kind: "nightly" as const, userId, at: now.toISOString() }));
            await sendMemoryMessages(env, chunk, Math.min(i * 60, 43_200) || undefined);
        }
        return undefined;
    }
    // No queue (self-hosted): as many as fit in one invocation, in a new order each night so nobody is always last.
    let changed = 0;
    const started = Date.now();
    const order = [...userIds].sort(() => Math.random() - 0.5);
    for (const [i, userId] of order.entries()) {
        if (Date.now() - started > NIGHTLY_BUDGET_MS) {
            logger.warn("cron", "memory_nightly_budget", { skipped: order.length - i });
            break;
        }
        const result = await nightlyForUser(env, userId, now);
        changed += result ? result.expired + result.decayed + result.merged + result.activity : 0;
    }
    return changed;
}

const NIGHTLY_CHUNK = 25;
/** Under a scheduled Worker's 15-minute limit, with room for the other daily jobs. */
const NIGHTLY_BUDGET_MS = 8 * 60_000;

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

/** Everything scheduled runs once a day, on the 06:00 UTC tick of the hourly trigger. */
const DAILY_HOUR_UTC = 6;

/**
 * The daily run. Any other hour returns at once (no query), so the database sleeps; at 06:00 UTC it prunes, runs the
 * memory backstop and sends every person's nightly memory message. Every job runs even if another fails; one
 * `cron_summary` line reports them all.
 */
export async function runHourlyCron(env: Env, now: Date = new Date()) {
    if (now.getUTCHours() !== DAILY_HOUR_UTC) return;
    const [mutations, memories, backstop, images, usage] = await Promise.allSettled([
        pruneStaleMutations(env, now),
        runMemoryNightly(env, now),
        runMemoryJob(env, now),
        pruneAiImages(env, now),
        pruneUsageEvents(env, now),
    ]);
    const ok = <T>(result: PromiseSettledResult<T>) => (result.status === "fulfilled" ? result.value : undefined);
    const failed = Object.entries({ mutations, memories, backstop, images, usage }).filter(([, r]) => r.status === "rejected");
    for (const [job, result] of failed) {
        logger.error("cron", "cron_job_failed", { job, issues: issuesFromError((result as PromiseRejectedResult).reason) });
    }
    logger.info("cron", "cron_summary", {
        prunedMutations: ok(mutations),
        memoryNightlyChanges: ok(memories),
        prunedImages: ok(images),
        prunedUsageEvents: ok(usage),
        failed: failed.length,
    });
}
