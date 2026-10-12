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

export async function runMemoryJob(env: Env, now: Date = new Date()): Promise<void> {
    const db = getDbClient(env);
    try {
        // A random few each run: someone at their daily cap with chats still waiting stays on the list all day,
        // and must not hold the same slots every minute.
        const rows = await db
            .select({ id: sql<string>`u.id` })
            .from(sql`memory_user_ids(${now.toISOString()}::timestamptz) AS u(id)`)
            .orderBy(sql`random()`)
            .limit(USERS_PER_RUN);
        let scrubbed = 0;
        let learned = 0;
        for (const { id: userId } of rows) {
            const pending = await withRls(db, userId, async (tx) => {
                scrubbed += await scrubForgotten(tx, userId);
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
        }
        if (rows.length > 0) logger.info("ai", "memory_job", { users: rows.length, scrubbed, learned });
    } catch (error) {
        logger.error("ai", "memory_job_failed", { issues: issuesFromError(error) });
    }
}
