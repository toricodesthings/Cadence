import { z } from "zod";
import { taskSchema } from "./task";

/** One row (or list-level hint) pushed over the live socket after a write. */
export const liveChangeSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("task"), task: taskSchema }),
    z.object({ type: z.literal("task.gone"), id: z.uuid() }),
    /** Sections or membership changed: refetch that list. */
    z.object({ type: z.literal("list"), listId: z.uuid() }),
]);
export type LiveChange = z.infer<typeof liveChangeSchema>;

export const LIVE_MAX_CHANGES = 50;
export const LIVE_MAX_BYTES = 64 * 1024;

export const liveMessageSchema = z.object({
    v: z.number().int(),
    ticket: z.string().optional(),
    changes: z.array(liveChangeSchema).max(LIVE_MAX_CHANGES).optional(),
});
export type LiveMessage = z.infer<typeof liveMessageSchema>;
