import { z } from "zod";

export const ALLOWED_EVENTS = [
    "task.complete",
    "task.reschedule",
    "task.create",
    "task.reorder",
    "habit.complete",
    "habit.skip",
    "inbox.capture",
    "inbox.process",
    "schedule.open",
    "schedule.drag",
    "search.query",
    "export.request",
] as const;

export const trackEventSchema = z.object({
    event: z.enum(ALLOWED_EVENTS),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TrackEvent = z.infer<typeof trackEventSchema>;

export const trackBatchSchema = z.object({
    events: z.array(trackEventSchema).min(1).max(50),
});
export type TrackBatch = z.infer<typeof trackBatchSchema>;
