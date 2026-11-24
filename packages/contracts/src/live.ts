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

export const presenceMessageSchema = z.object({
    type: z.literal("presence"),
    userIds: z.array(z.uuid()),
});
export type PresenceMessage = z.infer<typeof presenceMessageSchema>;

/** Close codes shared by every socket the backend opens and the app acts on. */
export const WS_CLOSE = {
    reload: 4000,
    accountGone: 4001,
    badToken: 4401,
    forbidden: 4403,
    rateLimited: 4429,
    error: 1011,
} as const;
