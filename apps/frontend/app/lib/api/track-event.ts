import { authenticatedFetch } from "./client";
import { API_BASE_URL } from "../env";

type UsageEvent =
    | "task.complete"
    | "task.reschedule"
    | "task.create"
    | "task.reorder"
    | "habit.complete"
    | "habit.skip"
    | "inbox.capture"
    | "inbox.process"
    | "schedule.open"
    | "schedule.drag"
    | "search.query"
    | "export.request";

const pendingEvents: Array<{ event: UsageEvent; metadata?: Record<string, unknown> }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Queue a usage event for batch delivery.
 * Events are batched and flushed every 5 seconds to reduce network chatter.
 * Silently no-ops if the user has opted out (server checks usageDiagnostics).
 */
export function trackUsageEvent(event: UsageEvent, metadata?: Record<string, unknown>) {
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
