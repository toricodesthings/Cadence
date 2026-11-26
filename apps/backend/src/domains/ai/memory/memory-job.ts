import { and, desc, eq, gt, gte, lt, max, sql } from "drizzle-orm";
import { aiConversations, taskNotes } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../../platform/log";
import type { Env } from "../../../types/env";
import { getRateLimitRedis } from "../../../platform/redis";
import { withinDailyBudget } from "../../../platform/daily-budget";
import { learnFromConversation } from "./learn";
import { learnFromNote, pendingNotes } from "./note-learn";
import { isLearning, readMemoryState } from "./memory-mode";
import { scrubForgotten } from "./memory-store";
import { nightlyForUser } from "./nightly";
import {
    IDLE_MINUTES,
    LEARN_DELAY_SECONDS,
    learnPendingKey,
    memoryMessageSchema,
    sendMemoryMessages,
    type MemoryMessage,
} from "./queue";

const USERS_PER_RUN = 10;
const CONVERSATIONS_PER_USER = 3;
const NOTES_PER_USER = 3;
const RECENT_DAYS = 3;

export const DAILY_EXTRACTIONS = 15;

export async function withinDailyCap(env: Env, userId: string, now: Date): Promise<boolean> {
    return withinDailyBudget(env, "memory-extract", await hashIdentifier(userId), DAILY_EXTRACTIONS, now, {
        failOpen: true,
    });
}

export async function learnForUser(
    env: Env,
    userId: string,
    now: Date,
): Promise<{ scrubbed: number; learned: number; activeAt: string | null }> {
    const db = getDbClient(env);
    let learned = 0;
    let scrubbed = 0;
    const pending = await withRls(db, userId, async (tx) => {
        scrubbed = await scrubForgotten(tx, userId);
        const state = await readMemoryState(tx, userId);
        if (!isLearning(state.mode)) return { chats: [], notes: [], activeAt: null };
        const idleBefore = new Date(now.getTime() - IDLE_MINUTES * 60_000).toISOString();
        const [chat] = await tx
            .select({ at: max(aiConversations.lastMessageAt) })
            .from(aiConversations)
            .where(
                and(
                    eq(aiConversations.userId, userId),
                    gte(aiConversations.lastMessageAt, idleBefore),
                    sql`coalesce(${aiConversations.metadata} ->> 'learn', 'true') <> 'false'`,
                ),
            );
        const [note] =
            state.mode === "full"
                ? await tx
                      .select({ at: max(taskNotes.updatedAt) })
                      .from(taskNotes)
                      .where(and(eq(taskNotes.userId, userId), gte(taskNotes.updatedAt, idleBefore)))
                : [];
        const activeAt =
            [chat?.at, note?.at]
                .filter((at): at is string => !!at)
                .sort()
                .at(-1) ?? null;
        const recentAfter = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60_000).toISOString();
        const found = await tx
            .select({ id: aiConversations.id })
            .from(aiConversations)
            .where(
                and(
                    eq(aiConversations.userId, userId),
                    lt(aiConversations.lastMessageAt, idleBefore),
                    gt(aiConversations.lastMessageAt, recentAfter),
                    sql`(${aiConversations.metadata} ->> 'memoryCursor' IS NULL OR (${aiConversations.metadata} ->> 'memoryCursor')::timestamptz < ${aiConversations.lastMessageAt})`,
                    sql`coalesce(${aiConversations.metadata} ->> 'learn', 'true') <> 'false'`,
                ),
            )
            .orderBy(desc(aiConversations.lastMessageAt))
            .limit(CONVERSATIONS_PER_USER);
        const notes =
            state.mode === "full"
                ? await pendingNotes(tx, userId, now, IDLE_MINUTES, RECENT_DAYS, NOTES_PER_USER, state.notBefore)
                : [];
        return { chats: found.map((c) => c.id), notes, activeAt };
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
    return { scrubbed, learned, activeAt: pending.activeAt };
}

const IN_FLIGHT_SECONDS = 5 * 60;
const QUEUED_USERS_PER_RUN = 500;

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
        const queued = Boolean(env.MEMORY_QUEUE);
        const rows = await db
            .select({ id: sql<string>`u.id` })
            .from(sql`memory_user_ids(${now.toISOString()}::timestamptz) AS u(id)`)
            .orderBy(sql`random()`)
            .limit(queued ? QUEUED_USERS_PER_RUN : USERS_PER_RUN);
        if (queued) {
            const due: MemoryMessage[] = (
                await claimLearn(
                    env,
                    rows.map((row) => row.id),
                )
            ).map((userId) => ({ kind: "learn", userId, at: now.toISOString() }));
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

async function followUpLearn(env: Env, userId: string, activeAt: string | null) {
    const redis = getRateLimitRedis(env);
    const key = await learnPendingKey(userId);
    if (!activeAt) {
        await redis?.del(key).catch(() => {});
        return;
    }
    const delaySeconds = Math.max(60, Math.ceil((Date.parse(activeAt) - Date.now()) / 1000) + LEARN_DELAY_SECONDS);
    await redis?.set(key, 1, { ex: delaySeconds + 60 }).catch(() => {});
    await sendMemoryMessages(env, [{ kind: "learn", userId, at: new Date().toISOString() }], delaySeconds);
}

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
                changes += result.expired + result.decayed + result.merged + result.activity;
            } else if (kind === "scrub") {
                changes += await withRls(getDbClient(env), userId, (tx) => scrubForgotten(tx, userId));
            } else {
                const result = await learnForUser(env, userId, new Date());
                learned += result.learned;
                await followUpLearn(env, userId, result.activeAt);
            }
            msg.ack();
            done++;
        } catch {
            msg.retry();
            retried++;
        }
    }
    logger.info("ai", "memory_queue", { size: batch.messages.length, done, retried, changes, learned });
}
