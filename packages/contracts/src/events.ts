import { z } from "zod";
import { errorCodeSchema } from "@cadence/contracts/common";

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

// Fixed dimensions keep browser telemetry private and useful for percentile graphs.
export const STARTUP_PHASES = ["session", "restore", "jwt", "required_data", "chunks", "reveal", "visible_assets", "api"] as const;
export const STARTUP_ROUTES = ["capture", "today", "schedule", "routines", "list", "tag", "upcoming", "completed", "trash", "events", "browse", "weekly_reset", "other"] as const;
export const PERFORMANCE_CACHE_CLASSES = ["warm", "cold", "unknown"] as const;
export const PERFORMANCE_PLATFORMS = ["web", "desktop"] as const;
export const PERFORMANCE_VIEWPORTS = ["compact", "wide"] as const;
export const PERFORMANCE_CATEGORIES = ["workspace", "tasks", "projects", "tags", "inbox", "habits", "settings", "subtasks", "appearance", "other"] as const;
export const performanceSampleSchema = z.object({
    phase: z.enum(STARTUP_PHASES),
    route: z.enum(STARTUP_ROUTES),
    duration_ms: z.number().finite().min(0).max(600_000),
    elapsed_ms: z.number().finite().min(0).max(600_000),
    cache: z.enum(PERFORMANCE_CACHE_CLASSES),
    outcome: z.enum(["ready", "network_unavailable", "error", "timeout"]),
    platform: z.enum(PERFORMANCE_PLATFORMS),
    viewport: z.enum(PERFORMANCE_VIEWPORTS),
    category: z.enum(PERFORMANCE_CATEGORIES).default("workspace"),
    count: z.number().int().min(0).max(10_000).default(0),
    encoded_bytes: z.number().int().min(0).max(100_000_000).default(0),
    decoded_bytes: z.number().int().min(0).max(100_000_000).default(0),
}).strict();
export const performanceBatchSchema = z.object({ samples: z.array(performanceSampleSchema).min(1).max(TRACK_BATCH_MAX) }).strict();
export type PerformanceSample = z.infer<typeof performanceSampleSchema>;

// No messages, stacks, URLs, user content or arbitrary client fields in error reports.
export const CLIENT_ERROR_KINDS = ["render", "runtime", "unhandled_rejection", "query", "mutation", "action"] as const;
export const CLIENT_ERROR_NAMES = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "ChunkLoadError", "Other"] as const;
export const clientErrorSchema = z.object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    name: z.enum(CLIENT_ERROR_NAMES),
    code: errorCodeSchema.optional(),
    route: z.enum(STARTUP_ROUTES),
    platform: z.enum(PERFORMANCE_PLATFORMS),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/).max(40),
}).strict();
export const clientErrorBatchSchema = z.object({ errors: z.array(clientErrorSchema).min(1).max(TRACK_BATCH_MAX) }).strict();
export type ClientError = z.infer<typeof clientErrorSchema>;
