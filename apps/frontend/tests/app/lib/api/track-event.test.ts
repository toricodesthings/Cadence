/**
 * §13.2 Acceptance: Telemetry events are emitted for all major flows
 * only when diagnostics are enabled.
 */
import { describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "../../../../app/lib/api/client";
import { setDiagnosticsEnabled, trackUsageEvent } from "../../../../app/lib/api/track-event";

vi.mock("../../../../app/lib/api/client", () => ({
    authenticatedFetch: vi.fn().mockResolvedValue(new Response()),
}));

vi.mock("../../../../app/lib/env", () => ({
    API_BASE_URL: "http://localhost:8787",
}));

describe("trackUsageEvent diagnostics gate", () => {
    it("no-ops when diagnostics are disabled", () => {
        vi.useFakeTimers();
        setDiagnosticsEnabled(false);

        trackUsageEvent("capture.submitted", { surface: "quick_add" });
        trackUsageEvent("task.create", { surface: "inline_add" });
        vi.advanceTimersByTime(6000);
        vi.useRealTimers();

        expect(authenticatedFetch).not.toHaveBeenCalled();
    });
});
