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

const SEND_BATCH_MAX = 100;

export async function sendMemoryMessages(env: Env, messages: MemoryMessage[], delaySeconds?: number): Promise<boolean> {
    if (!env.MEMORY_QUEUE) return false;
    for (let i = 0; i < messages.length; i += SEND_BATCH_MAX) {
        await env.MEMORY_QUEUE.sendBatch(messages.slice(i, i + SEND_BATCH_MAX).map((body) => ({ body, delaySeconds })));
    }
    return true;
}

export const IDLE_MINUTES = 10;
const MARGIN_SECONDS = 30;
export const LEARN_DELAY_SECONDS = IDLE_MINUTES * 60 + MARGIN_SECONDS;

export const learnPendingKey = async (userId: string) => `memory:learn-pending:${await hashIdentifier(userId)}`;

export async function scheduleLearn(env: Env, userId: string): Promise<void> {
    if (!env.MEMORY_QUEUE) return;
    const redis = getRateLimitRedis(env);
    try {
        const waiting =
            redis &&
            (await redis
                .set(await learnPendingKey(userId), 1, { nx: true, ex: LEARN_DELAY_SECONDS + 60 })
                .catch(() => "unknown")) === null;
        if (waiting) return;
        await sendMemoryMessages(env, [{ kind: "learn", userId, at: new Date().toISOString() }], LEARN_DELAY_SECONDS);
    } catch (err) {
        await redis?.del(await learnPendingKey(userId)).catch(() => {});
        logger.warn("ai", "memory_schedule_failed", {
            kind: "learn",
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(err),
        });
    }
}

export async function scheduleScrub(env: Env, userId: string, undoMinutes: number): Promise<void> {
    try {
        await sendMemoryMessages(
            env,
            [{ kind: "scrub", userId, at: new Date().toISOString() }],
            undoMinutes * 60 + MARGIN_SECONDS,
        );
    } catch (err) {
        logger.warn("ai", "memory_schedule_failed", {
            kind: "scrub",
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(err),
        });
    }
}
