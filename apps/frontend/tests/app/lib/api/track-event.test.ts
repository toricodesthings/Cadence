/**
 * §13.2 Acceptance: Telemetry events are emitted for all major flows
 * only when diagnostics are enabled.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../../../app/lib/api/client";
import { setDiagnosticsEnabled, trackUsageEvent, trackClientError, trackPerformance, setCrashReportsEnabled } from "../../../../app/lib/api/track-event";

vi.mock("../../../../app/lib/api/client", () => ({
    apiClient: { api: { events: { batch: { $post: vi.fn().mockResolvedValue(new Response()) }, performance: { $post: vi.fn().mockResolvedValue(new Response()) }, errors: { $post: vi.fn().mockResolvedValue(new Response()) } } } },
}));

vi.mock("../../../../app/lib/env", () => ({
    API_BASE_URL: "http://localhost:8787", RUNTIME_TARGET: "web",
}));

describe("trackUsageEvent diagnostics gate", () => {
    beforeEach(() => { vi.useFakeTimers(); setDiagnosticsEnabled(false); setCrashReportsEnabled(false); vi.clearAllMocks(); });
    afterEach(() => { setDiagnosticsEnabled(false); setCrashReportsEnabled(false); vi.useRealTimers(); });
    it("no-ops when diagnostics are disabled", () => {
        vi.useFakeTimers();
        setDiagnosticsEnabled(false);

        trackUsageEvent("capture.submitted", { surface: "quick_add" });
        trackUsageEvent("task.create", { surface: "inline_add" });
        vi.advanceTimersByTime(6000);
        vi.useRealTimers();

        expect(apiClient.api.events.batch.$post).not.toHaveBeenCalled();
    });
    it("discards queued events when the user opts out before delivery", async () => {
        setDiagnosticsEnabled(true);
        trackUsageEvent("task.create");
        setDiagnosticsEnabled(false);
        await vi.advanceTimersByTimeAsync(6000);
        setDiagnosticsEnabled(true);
        await vi.advanceTimersByTimeAsync(6000);
        expect(apiClient.api.events.batch.$post).not.toHaveBeenCalled();
    });
    it("batches enabled events and aborts delivery on opt-out", async () => {
        setDiagnosticsEnabled(true);
        trackUsageEvent("task.create");
        trackUsageEvent("task.complete");
        vi.mocked(apiClient.api.events.batch.$post).mockImplementationOnce(() => new Promise(() => {}));
        await vi.advanceTimersByTimeAsync(5000);
        expect(apiClient.api.events.batch.$post).toHaveBeenCalledTimes(1);
        expect(vi.mocked(apiClient.api.events.batch.$post).mock.calls[0][0]).toEqual({ json: { events: [{ event: "task.create" }, { event: "task.complete" }] } });
        const signal = vi.mocked(apiClient.api.events.batch.$post).mock.calls[0][1]?.init?.signal;
        setDiagnosticsEnabled(false);
        expect(signal?.aborted).toBe(true);
    });
    it("deduplicates error objects and sends only fixed error dimensions", async () => {
        setDiagnosticsEnabled(true);
        setCrashReportsEnabled(true);
        const error = new TypeError("private task title / token");
        trackClientError(error, "render");
        trackClientError(error, "runtime");
        await vi.advanceTimersByTimeAsync(5000);
        const body = vi.mocked(apiClient.api.events.errors.$post).mock.calls[0][0];
        expect(body.json.errors).toHaveLength(1);
        expect(body.json.errors[0]).toMatchObject({ kind: "render", name: "TypeError", platform: "web" });
        expect(JSON.stringify(body)).not.toMatch(/private|token|stack|message/);
    });
    it("drops each report type when its consent is withdrawn", async () => {
        setDiagnosticsEnabled(true);
        setCrashReportsEnabled(true);
        trackClientError(new Error("private"), "query");
        trackPerformance([{ phase: "reveal", route: "capture", duration_ms: 10, elapsed_ms: 10, cache: "warm", outcome: "ready", platform: "web", viewport: "wide", category: "workspace", count: 0, encoded_bytes: 0, decoded_bytes: 0 }]);
        setDiagnosticsEnabled(false);
        setCrashReportsEnabled(false);
        setDiagnosticsEnabled(true);
        await vi.advanceTimersByTimeAsync(6000);
        expect(apiClient.api.events.errors.$post).not.toHaveBeenCalled();
        expect(apiClient.api.events.performance.$post).not.toHaveBeenCalled();
    });

    it("uses crash consent independently of usage diagnostics", async () => {
        setDiagnosticsEnabled(false);
        setCrashReportsEnabled(true);
        trackClientError(new Error("private"), "render");
        trackUsageEvent("task.create");
        await vi.advanceTimersByTimeAsync(5000);
        expect(apiClient.api.events.errors.$post).toHaveBeenCalledTimes(1);
        expect(apiClient.api.events.batch.$post).not.toHaveBeenCalled();
    });

});
