import { CLIENT_ERROR_NAMES, TRACK_BATCH_MAX, type ClientError, type UsageEvent, type PerformanceSample } from "@cadence/contracts/events";
import { ERROR_CODES, type ErrorCode } from "@cadence/contracts/common";
import { CADENCE_VERSION } from "../constants/app-info";
import { startupRoute } from "../startup-timing";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { setErrorReporter } from "../log";
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
const pendingPerformance: PerformanceSample[] = [];
const pendingErrors: ClientError[] = [];
let seenErrors = new WeakSet<object>();
let errorCount = 0;
let delivery: AbortController | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** §11.8: Client-side diagnostics gate — set by the settings-aware initializer */
let diagnosticsEnabled = false;
let crashReportsEnabled = false;

/** Allow settings layer to enable/disable telemetry client-side */
export function setDiagnosticsEnabled(enabled: boolean) {
    diagnosticsEnabled = enabled;
    if (!enabled) {
        pendingEvents.length = pendingPerformance.length = 0;
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = null;
        delivery?.abort();
        delivery = null;
        if (pendingErrors.length) scheduleFlush();
    }
}

export function setCrashReportsEnabled(enabled: boolean) {
    crashReportsEnabled = enabled;
    if (!enabled) {
        pendingErrors.length = 0;
        seenErrors = new WeakSet();
        errorCount = 0;
        delivery?.abort();
        delivery = null;
    }
}

export function trackClientError(error: unknown, kind: ClientError["kind"]) {
    if (!crashReportsEnabled || errorCount >= TRACK_BATCH_MAX || typeof window === "undefined") return;
    const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
    if (value.name === "AbortError" || seenErrors.has(value)) return;
    seenErrors.add(value);
    errorCount++;
    pendingErrors.push({
        kind,
        name: (CLIENT_ERROR_NAMES as readonly unknown[]).includes(value.name) ? value.name as ClientError["name"] : "Other",
        ...((ERROR_CODES as readonly unknown[]).includes(value.code) ? { code: value.code as ErrorCode } : {}),
        route: startupRoute(window.location.pathname),
        platform: IS_DESKTOP_RUNTIME ? "desktop" : "web",
        version: CADENCE_VERSION,
    });
    scheduleFlush();
}

setErrorReporter(trackClientError);

function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(() => { void flushEvents(); }, 5_000);
}

export function trackPerformance(samples: PerformanceSample[]) {
    if (!diagnosticsEnabled || !samples.length) return;
    pendingPerformance.push(...samples.slice(0, TRACK_BATCH_MAX));
    // Keep memory bounded even if the tab never gets a successful delivery.
    pendingPerformance.splice(0, Math.max(0, pendingPerformance.length - TRACK_BATCH_MAX));
    scheduleFlush();
}

/**
 * Queue a usage event for batch delivery.
 * Events are batched and flushed every 5 seconds to reduce network chatter.
 * No-ops if the user has opted out of usage diagnostics.
 */
export function trackUsageEvent(event: UsageEvent, metadata?: UsageEventMetadata) {
    if (!diagnosticsEnabled) return;
    pendingEvents.push({ event, metadata });
    pendingEvents.splice(0, Math.max(0, pendingEvents.length - TRACK_BATCH_MAX * 2));
    scheduleFlush();
}

async function flushEvents() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    if (delivery) return;
    if (!pendingEvents.length && !pendingPerformance.length && !pendingErrors.length) return;

    const batch = pendingEvents.splice(0, TRACK_BATCH_MAX);
    const samples = pendingPerformance.splice(0, TRACK_BATCH_MAX);
    const errors = pendingErrors.splice(0, TRACK_BATCH_MAX);
    const controller = new AbortController();
    delivery = controller;

    try {
        await Promise.allSettled([
            ...(batch.length ? [apiClient.api.events.batch.$post({ json: { events: batch } }, { init: { signal: controller.signal, keepalive: true } })] : []),
            ...(samples.length ? [apiClient.api.events.performance.$post({ json: { samples } }, { init: { signal: controller.signal, keepalive: true } })] : []),
            ...(errors.length ? [apiClient.api.events.errors.$post({ json: { errors } }, { init: { signal: controller.signal, keepalive: true } })] : []),
        ]);
    } catch {
        // Best-effort telemetry — silently discard on failure
    } finally {
        if (delivery === controller) delivery = null;
        if (delivery === null && (pendingEvents.length || pendingPerformance.length || pendingErrors.length)) scheduleFlush();
    }
}

// Best-effort flush when hidden; delivery is not guaranteed after a tab closes.
if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => trackClientError(event.error, "runtime"));
    window.addEventListener("unhandledrejection", (event) => trackClientError(event.reason, "unhandled_rejection"));
    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            void flushEvents();
        }
    });
}
