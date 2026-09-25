import { z } from "zod";

/**
 * Every usage event the API accepts. Names older desktop builds still send stay
 * here even after the web app stops sending them.
 */
export const USAGE_EVENTS = [
    "capture.opened",
    "capture.submitted",
    "capture.clarify_opened",
    "capture.placed",
    "capture.discarded",
    "nlp.parse_completed",
    "nlp.entity_dismissed",
    "nlp.low_confidence_seen",
    "task.complete",
    "task.reschedule",
    "task.create",
    "task.reorder",
    "task.quick_action_used",
    "task.context_menu_opened",
    "task.context_menu_action",
    "habit.complete",
    "habit.skip",
    "habit.snooze",
    "habit.resume",
    "habit.pause",
    "habit.context_menu_opened",
    "habit.context_menu_action",
    "capture.context_menu_opened",
    "capture.context_menu_action",
    "inbox.capture",
    "inbox.process",
    "project.context_menu_opened",
    "project.context_menu_action",
    "schedule.open",
    "schedule.drag",
    "schedule.drop_completed",
    "schedule.quick_add_used",
    "schedule.context_menu_opened",
    "schedule.context_menu_action",
    "event.context_menu_opened",
    "event.context_menu_action",
    "shortcut.used",
    "command_palette.opened",
    "command_palette.result_opened",
    "reminder.presented",
    "reminder.deferred",
    "reminder.dismissed",
    "reminder.completed",
    "weekly_reset.started",
    "weekly_reset.abandoned",
    "weekly_reset.completed",
    "search.query",
    "export.request",
] as const;

/** Most events one batch may carry. */
export const TRACK_BATCH_MAX = 50;

export const trackEventSchema = z.object({
    event: z.enum(USAGE_EVENTS),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const trackBatchSchema = z.object({
    events: z.array(trackEventSchema).min(1).max(TRACK_BATCH_MAX),
});

export type TrackEvent = z.infer<typeof trackEventSchema>;
export type UsageEvent = TrackEvent["event"];
