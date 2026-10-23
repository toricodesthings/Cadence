/**
 * Memory's background work as queue messages: the nightly cron enqueues one message per person, and events
 * (a chat turn, a note save, a Forget) enqueue a delayed one for when its work falls due, so nothing polls.
 * The consumer (`handleMemoryBatch`, in memory-job.ts) does the model calls. Messages carry ids and a time,
 * never text. Delivery is at-least-once, which is safe: every unit is fenced (cursors, epoch, content hash).
 */
import { z } from "zod";
import { instantSchema } from "@cadence/contracts/common";
import { getRateLimitRedis } from "../../../platform/redis";
import { hashIdentifier, logger, issuesFromError } from "../../../platform/log";
import type { Env } from "../../../types/env";

export const memoryMessageSchema = z.object({
    kind: z.enum(["nightly", "learn", "scrub"]),
    userId: z.string().min(1),
    at: instantSchema,
});
export type MemoryMessage = z.infer<typeof memoryMessageSchema>;

/** Queue sendBatch takes at most 100 messages a call. */
const SEND_BATCH_MAX = 100;

/** Enqueues the messages (after `delaySeconds`, if given), or returns false (nothing sent) when there is no queue, so the caller runs them in-process. */
export async function sendMemoryMessages(env: Env, messages: MemoryMessage[], delaySeconds?: number): Promise<boolean> {
    if (!env.MEMORY_QUEUE) return false;
    for (let i = 0; i < messages.length; i += SEND_BATCH_MAX) {
        await env.MEMORY_QUEUE.sendBatch(messages.slice(i, i + SEND_BATCH_MAX).map((body) => ({ body, delaySeconds })));
    }
    return true;
}

/** Idle time before a chat or note is read, so one reading covers a whole sitting. */
export const IDLE_MINUTES = 10;
/** Queue delays land a little late, never early; this margin keeps a message from arriving a moment before its work is due. */
const MARGIN_SECONDS = 30;
export const LEARN_DELAY_SECONDS = IDLE_MINUTES * 60 + MARGIN_SECONDS;

/** The Upstash key that marks a person's `learn` message as already waiting in the queue. */
export const learnPendingKey = async (userId: string) => `memory:learn-pending:${await hashIdentifier(userId)}`;

/**
 * After a chat turn or a note save: one delayed `learn` message per sitting. Only the first event in a window
 * sends it (Upstash `SET NX`); the consumer re-delays itself while the person keeps going. No queue: nothing
 * (the daily backstop reads it). No Redis, or Redis failing: send anyway (a duplicate reading is fenced, only wasted work).
 */
export async function scheduleLearn(env: Env, userId: string): Promise<void> {
    if (!env.MEMORY_QUEUE) return;
    try {
        const redis = getRateLimitRedis(env);
        const waiting = redis && (await redis.set(await learnPendingKey(userId), 1, { nx: true, ex: LEARN_DELAY_SECONDS + 60 }).catch(() => "unknown")) === null;
        if (waiting) return;
        await sendMemoryMessages(env, [{ kind: "learn", userId, at: new Date().toISOString() }], LEARN_DELAY_SECONDS);
    } catch (err) {
        logger.warn("ai", "memory_schedule_failed", { kind: "learn", userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
    }
}

/** After a Forget: reduce it to a label once its Undo window has passed. */
export async function scheduleScrub(env: Env, userId: string, undoMinutes: number): Promise<void> {
    try {
        await sendMemoryMessages(env, [{ kind: "scrub", userId, at: new Date().toISOString() }], undoMinutes * 60 + MARGIN_SECONDS);
    } catch (err) {
        logger.warn("ai", "memory_schedule_failed", { kind: "scrub", userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
    }
}
