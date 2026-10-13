/**
 * The every-minute memory job: forgotten facts past their Undo window are reduced to a label, and chats
 * idle for 10 minutes are learned from. `memory_user_ids` (SECURITY DEFINER, ids only) lists who has work;
 * everything else runs per user under RLS.
 */
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { aiConversations } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import type { Env } from "../../../types/env";
import { getRateLimitRedis } from "../../../platform/redis";
import { learnFromConversation } from "./learn";
import { learnFromNote, pendingNotes } from "./note-learn";
import { isLearning, readMemoryState } from "./memory-mode";
import { scrubForgotten } from "./memory-store";
import { nightlyForUser } from "./nightly";
import { memoryMessageSchema, sendMemoryMessages, type MemoryMessage } from "./queue";

/** Idle time before a chat is read, so one reading covers a whole sitting. */
export const IDLE_MINUTES = 10;
/** Per run: how many people and how many chats each, so a backlog drains over a few minutes instead of one burst. */
const USERS_PER_RUN = 10;
const CONVERSATIONS_PER_USER = 3;
const NOTES_PER_USER = 3;
/** Notes older than this are the backfill's (a chat's window is the same). */
const RECENT_DAYS = 3;

/** Extraction calls per person per day: only a chat or note with something new to read counts. OpenRouter's account limit sits behind it. */
export const DAILY_EXTRACTIONS = 15;

/**
 * True while the person is under their day's extraction budget, counting this one. A day is the UTC day: the
 * budget is cost control, not a promise about "today". No Redis (or an error) means no cap, never a stuck job.
 */
export async function withinDailyCap(env: Env, userId: string, now: Date): Promise<boolean> {
    const redis = getRateLimitRedis(env);
    if (!redis) return true;
    try {
        const key = `memory:extract:${await hashIdentifier(userId)}:${now.toISOString().slice(0, 10)}`; // time-ok: a cost-control bucket named by the UTC date
        const used = await redis.incr(key);
        if (used === 1) await redis.expire(key, 26 * 60 * 60);
        return used <= DAILY_EXTRACTIONS;
    } catch {
        return true;
    }
}

/** One person's turn: forgotten facts scrubbed, then their idle chats and notes read, with the extraction budget as the stop. */
export async function learnForUser(env: Env, userId: string, now: Date): Promise<{ scrubbed: number; learned: number }> {
    const db = getDbClient(env);
    let learned = 0;
    let scrubbed = 0;
    const pending = await withRls(db, userId, async (tx) => {
        scrubbed = await scrubForgotten(tx, userId);
        const state = await readMemoryState(tx, userId);
        if (!isLearning(state.mode)) return { chats: [], notes: [] };
        const idleBefore = new Date(now.getTime() - IDLE_MINUTES * 60_000).toISOString();
        const recentAfter = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60_000).toISOString();
        const found = await tx
            .select({ id: aiConversations.id })
            .from(aiConversations)
            .where(and(
                eq(aiConversations.userId, userId),
                lt(aiConversations.lastMessageAt, idleBefore),
                gt(aiConversations.lastMessageAt, recentAfter),
                sql`(${aiConversations.metadata} ->> 'memoryCursor' IS NULL OR (${aiConversations.metadata} ->> 'memoryCursor')::timestamptz < ${aiConversations.lastMessageAt})`,
                sql`coalesce(${aiConversations.metadata} ->> 'learn', 'true') <> 'false'`,
            ))
            .orderBy(desc(aiConversations.lastMessageAt))
            .limit(CONVERSATIONS_PER_USER);
        const notes = state.mode === "full" ? await pendingNotes(tx, userId, now, IDLE_MINUTES, RECENT_DAYS, NOTES_PER_USER) : [];
        return { chats: found.map((c) => c.id), notes };
    });
    const admit = () => withinDailyCap(env, userId, now);
    for (const conversationId of pending.chats) {
        const result = await learnFromConversation(env, userId, conversationId, now, admit);
        if (result.capped) break;
        learned += result.saved + result.updated + result.reinforced;
    }
    for (const taskId of pending.notes) {
        const result = await learnFromNote(env, userId, taskId, now, admit);
        if (result?.capped) break;
        if (result) learned += result.saved + result.updated + result.reinforced;
    }
    return { scrubbed, learned };
}

/** A person's `learn` message stays "in flight" this long, so a slow reading isn't queued again every minute. */
const IN_FLIGHT_SECONDS = 5 * 60;
/** With a queue the cron only lists and enqueues, so it can take far more people than the in-process loop. */
const QUEUED_USERS_PER_RUN = 500;

/**
 * The people with no `learn` message queued in the last few minutes, claimed in one pipelined round trip (one
 * subrequest however many people). No Redis or an error: everyone (writes are fenced, so a duplicate is only wasted work).
 */
async function claimLearn(env: Env, userIds: string[]): Promise<string[]> {
    const redis = getRateLimitRedis(env);
    if (!redis || userIds.length === 0) return userIds;
    try {
        const keys = await Promise.all(userIds.map(async (userId) => `memory:learn:${await hashIdentifier(userId)}`));
        const pipe = redis.pipeline();
        for (const key of keys) pipe.set(key, 1, { nx: true, ex: IN_FLIGHT_SECONDS });
        const claimed = await pipe.exec();
        return userIds.filter((_, i) => claimed[i] !== null);
    } catch {
        return userIds;
    }
}

export async function runMemoryJob(env: Env, now: Date = new Date()): Promise<void> {
    const db = getDbClient(env);
    try {
        // A random few each run: someone at their daily cap with chats still waiting stays on the list all day,
        // and must not hold the same slots every minute.
        const queued = Boolean(env.MEMORY_QUEUE);
        const rows = await db
            .select({ id: sql<string>`u.id` })
            .from(sql`memory_user_ids(${now.toISOString()}::timestamptz) AS u(id)`)
            .orderBy(sql`random()`)
            .limit(queued ? QUEUED_USERS_PER_RUN : USERS_PER_RUN);
        if (queued) {
            const due: MemoryMessage[] = (await claimLearn(env, rows.map((row) => row.id))).map((userId) => ({ kind: "learn", userId, at: now.toISOString() }));
            await sendMemoryMessages(env, due);
            if (due.length > 0) logger.info("ai", "memory_job", { users: rows.length, queued: due.length });
            return;
        }
        let scrubbed = 0;
        let learned = 0;
        for (const { id: userId } of rows) {
            const result = await learnForUser(env, userId, now);
            scrubbed += result.scrubbed;
            learned += result.learned;
        }
        if (rows.length > 0) logger.info("ai", "memory_job", { users: rows.length, scrubbed, learned });
    } catch (error) {
        logger.error("ai", "memory_job_failed", { issues: issuesFromError(error) });
    }
}

/**
 * The queue consumer: one message per person. A unit that fails (or `nightlyForUser`, which reports failure as
 * null) is retried by the queue, then lands in the dead-letter queue; a malformed message is dropped.
 */
export async function handleMemoryBatch(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    let done = 0;
    let retried = 0;
    let changes = 0;
    let learned = 0;
    for (const msg of batch.messages) {
        const parsed = memoryMessageSchema.safeParse(msg.body);
        if (!parsed.success) {
            logger.warn("ai", "memory_queue_bad_message", {});
            msg.ack();
            continue;
        }
        const { kind, userId, at } = parsed.data;
        try {
            if (kind === "nightly") {
                const result = await nightlyForUser(env, userId, new Date(at));
                if (!result) throw new Error("nightly failed");
                changes += result.expired + result.decayed + result.merged + result.evicted + result.activity;
            } else {
                learned += (await learnForUser(env, userId, new Date(at))).learned;
            }
            msg.ack();
            done++;
        } catch {
            msg.retry(); // after wrangler.jsonc retry_delay
            retried++;
        }
    }
    logger.info("ai", "memory_queue", { size: batch.messages.length, done, retried, changes, learned });
}
