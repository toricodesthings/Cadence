/**
 * Memory's background work as queue messages: the crons decide who is due and enqueue one message per person;
 * the consumer (`handleMemoryBatch`, in memory-job.ts) does the model calls. Messages carry ids and a time,
 * never text. Delivery is at-least-once, which is safe: every unit is fenced (cursors, epoch, content hash).
 */
import { z } from "zod";
import { instantSchema } from "@cadence/contracts/common";
import type { Env } from "../../../types/env";

export const memoryMessageSchema = z.object({
    kind: z.enum(["nightly", "learn"]),
    userId: z.string().min(1),
    at: instantSchema,
});
export type MemoryMessage = z.infer<typeof memoryMessageSchema>;

/** Queue sendBatch takes at most 100 messages a call. */
const SEND_BATCH_MAX = 100;

/** Enqueues the messages, or returns false (nothing sent) when there is no queue, so the caller runs them in-process. */
export async function sendMemoryMessages(env: Env, messages: MemoryMessage[]): Promise<boolean> {
    if (!env.MEMORY_QUEUE) return false;
    for (let i = 0; i < messages.length; i += SEND_BATCH_MAX) {
        await env.MEMORY_QUEUE.sendBatch(messages.slice(i, i + SEND_BATCH_MAX).map((body) => ({ body })));
    }
    return true;
}
