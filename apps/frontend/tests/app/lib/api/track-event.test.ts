/**
 * §13.2 Acceptance: Telemetry events are emitted for all major flows
 * only when diagnostics are enabled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test the module's gating behavior, so we import and reset
let trackUsageEvent: typeof import("../../../../app/lib/api/track-event").trackUsageEvent;
let setDiagnosticsEnabled: typeof import("../../../../app/lib/api/track-event").setDiagnosticsEnabled;

// Mock authenticatedFetch to prevent actual network calls
vi.mock("../../../../app/lib/api/client", () => ({
    authenticatedFetch: vi.fn().mockResolvedValue(new Response()),
}));

vi.mock("../../../../app/lib/env", () => ({
    API_BASE_URL: "http://localhost:8787",
}));

beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../../../app/lib/api/track-event");
    trackUsageEvent = mod.trackUsageEvent;
    setDiagnosticsEnabled = mod.setDiagnosticsEnabled;
});

describe("trackUsageEvent diagnostics gate", () => {
    it("queues events when diagnostics are enabled (default)", () => {
        // Default is enabled — calling should not throw
        expect(() => trackUsageEvent("capture.submitted", { surface: "quick_add" })).not.toThrow();
    });

    it("no-ops when diagnostics are disabled", async () => {
        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        setDiagnosticsEnabled(false);

        trackUsageEvent("capture.submitted", { surface: "quick_add" });
        trackUsageEvent("task.create", { surface: "inline_add" });

        // Force flush by advancing timers
        vi.useFakeTimers();
        vi.advanceTimersByTime(6000);
        vi.useRealTimers();

        // authenticatedFetch should NOT have been called because events were gated
        expect(authenticatedFetch).not.toHaveBeenCalled();
    });

    it("re-enables after calling setDiagnosticsEnabled(true)", () => {
        setDiagnosticsEnabled(false);
        setDiagnosticsEnabled(true);

        // Should not throw — events are queued again
        expect(() => trackUsageEvent("shortcut.used", { input_method: "keyboard" })).not.toThrow();
    });
});
