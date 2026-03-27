import { authenticatedFetch } from "./client";
import { API_BASE_URL } from "../env";

type UsageEvent =
    // Capture lifecycle
    | "capture.opened"
    | "capture.submitted"
    | "capture.clarify_opened"
    | "capture.placed"
    | "capture.discarded"
    // NLP events
    | "nlp.parse_completed"
    | "nlp.entity_dismissed"
    | "nlp.low_confidence_seen"
    // Task events
    | "task.complete"
    | "task.reschedule"
    | "task.create"
    | "task.reorder"
    | "task.quick_action_used"
    | "task.context_menu_opened"
    | "task.context_menu_action"
    // Habit events
    | "habit.complete"
    | "habit.skip"
    | "habit.snooze"
    | "habit.resume"
    | "habit.pause"
    | "habit.context_menu_opened"
    | "habit.context_menu_action"
    // Capture / Inbox events
    | "capture.context_menu_opened"
    | "capture.context_menu_action"
    | "inbox.capture"
    | "inbox.process"
    // Project events
    | "project.context_menu_opened"
    | "project.context_menu_action"
    // Schedule events
    | "schedule.open"
    | "schedule.drag"
    | "schedule.drop_completed"
    | "schedule.quick_add_used"
    | "schedule.context_menu_opened"
    | "schedule.context_menu_action"
    // Event events
    | "event.context_menu_opened"
    | "event.context_menu_action"
    // Keyboard & navigation
    | "shortcut.used"
    | "command_palette.opened"
    | "command_palette.result_opened"
    // Reminders
    | "reminder.presented"
    | "reminder.deferred"
    | "reminder.dismissed"
    | "reminder.completed"
    // Weekly reset
    | "weekly_reset.started"
    | "weekly_reset.abandoned"
    | "weekly_reset.completed"
    // Search & export
    | "search.query"
    | "export.request";

/** Structured telemetry metadata per §11.8 taxonomy */
export interface UsageEventMetadata {
    surface?: string;
    route?: string;
    input_method?: "click" | "keyboard" | "context_menu" | "touch" | "dnd" | "command_palette";
    object_type?: "task" | "capture" | "habit" | "project" | "event" | "schedule_cell";
    confidence_tier?: "high" | "medium" | "low";
    outcome?: string;
    latency_ms?: number;
    selection_count?: number;
    [key: string]: unknown;
}

const pendingEvents: Array<{ event: UsageEvent; metadata?: UsageEventMetadata }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** §11.8: Client-side diagnostics gate — set by the settings-aware initializer */
let diagnosticsEnabled = true;

/** Allow settings layer to enable/disable telemetry client-side */
export function setDiagnosticsEnabled(enabled: boolean) {
    diagnosticsEnabled = enabled;
}

/**
 * Queue a usage event for batch delivery.
 * Events are batched and flushed every 5 seconds to reduce network chatter.
 * No-ops if the user has opted out of usage diagnostics.
 */
export function trackUsageEvent(event: UsageEvent, metadata?: UsageEventMetadata) {
    if (!diagnosticsEnabled) return;
    pendingEvents.push({ event, metadata });

    if (!flushTimer) {
        flushTimer = setTimeout(flushEvents, 5_000);
    }
}

async function flushEvents() {
    flushTimer = null;
    if (pendingEvents.length === 0) return;

    const batch = pendingEvents.splice(0, 50);

    try {
        await authenticatedFetch(`${API_BASE_URL}/api/v1/events/batch`, {
            method: "POST",
            authenticated: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events: batch }),
        });
    } catch {
        // Best-effort telemetry — silently discard on failure
    }
}

// Flush on page unload so events aren't lost
if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && pendingEvents.length > 0) {
            flushEvents();
        }
    });
}
