import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectStartupSamples, recordStartupRead, resetStartupTiming, startupMark, startupRoute, startupEndpoint } from "../../../app/lib/startup-timing";
import { performanceBatchSchema } from "@cadence/contracts/events";

beforeEach(() => resetStartupTiming());
describe("startup measurements", () => {
    it("reports phase durations separately from time since navigation and excludes resource URLs", () => {
        const clock = vi.spyOn(performance, "now");
        clock.mockReturnValue(500); startupMark("session.start");
        clock.mockReturnValue(700); startupMark("session.ready");
        clock.mockReturnValue(1500); startupMark("reveal.ready");
        recordStartupRead("tasks", 1200, "ready");
        const samples = collectStartupSamples({ route: "list", cache: "cold", platform: "web", viewport: "compact" });
        expect(samples.find((s) => s.phase === "session")).toMatchObject({ duration_ms: 200, elapsed_ms: 700 });
        expect(samples.find((s) => s.phase === "reveal")).toMatchObject({ duration_ms: 1500 });
        expect(performanceBatchSchema.safeParse({ samples }).success).toBe(true);
        expect(JSON.stringify(samples)).not.toContain("http");
    });
    it.each([["/project/private-id?secret=token", "list"], ["/tag/private-id", "tag"], ["/", "capture"], ["/unrecognized/private", "other"]])("reduces %s to a fixed route category", (path, route) => {
        expect(startupRoute(path)).toBe(route);
    });
});

it("excludes background reads after reveal and emits no navigation sample on an account switch", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(500);
    recordStartupRead("tasks", 400, "ready");
    startupMark("reveal.ready");
    clock.mockReturnValue(800);
    recordStartupRead("habits", 600, "ready");
    const context = { route: "capture", cache: "warm", platform: "web", viewport: "wide" } as const;
    expect(collectStartupSamples(context).filter((s) => s.phase === "api").map((s) => s.category)).toEqual(["tasks"]);
    resetStartupTiming(false);
    startupMark("reveal.ready");
    expect(collectStartupSamples(context)).toEqual([]);
});

it.each([
    ["/api/v1/settings/notification-state", "notification_state"],
    ["/api/v1/settings/focus-views/private-id", "focus_views"],
    ["/api/v1/debug/capabilities", "debug_capabilities"],
    ["/api/v1/inbox?status=kept", "inbox_kept"],
    ["/api/v1/tasks?hasNoProject=true&hasNoDate=true", "tasks_capture"],
    ["/api/v1/proxy/weather?latitude=private", "proxy"],
    ["/api/v1/unknown?secret=private", "other"],
])("classifies %s without private identifiers", (path, expected) => {
    expect(startupEndpoint(new URL(path, "https://example.test"))).toBe(expected);
});
it("keeps headers, body, and legacy readiness timings distinct and labels the build", () => {
    vi.spyOn(performance, "now").mockReturnValue(200);
    recordStartupRead("tasks", 100, "ready", { endpoint: "tasks_open", status: 200 });
    vi.spyOn(performance, "now").mockReturnValue(300);
    recordStartupRead("tasks", 210, "error", { endpoint: "tasks_open", status: 503, error_code: "INTERNAL_ERROR" }, "api_body");
    startupMark("reveal.ready");
    const samples = collectStartupSamples({ route: "capture", cache: "cold", platform: "web", viewport: "wide" });
    expect(samples.find(s => s.phase === "api")).toMatchObject({ duration_ms: 100, elapsed_ms: 300, measurement_revision: 2 });
    expect(samples.find(s => s.phase === "api_body")).toMatchObject({ duration_ms: 90, elapsed_ms: 300, error_code: "INTERNAL_ERROR" });
    expect(samples.every(s => typeof s.build_id === "string")).toBe(true);
    expect(performanceBatchSchema.safeParse({ samples }).success).toBe(true);
});
