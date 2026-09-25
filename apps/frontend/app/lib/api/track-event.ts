import { TRACK_BATCH_MAX, type UsageEvent } from "@cadence/contracts/events";
import { apiClient } from "./client";

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

    const batch = pendingEvents.splice(0, TRACK_BATCH_MAX);

    try {
        await apiClient.api.events.batch.$post({ json: { events: batch } });
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
