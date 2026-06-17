import { describe, expect, it, vi } from "vitest";
import { logValidationFailure } from "../../src/platform/request-log";

function createFakeContext() {
    const store: Record<string, unknown> = {};
    return {
        var: { userId: "user-123" },
        req: {
            method: "GET",
            path: "/api/v1/tasks",
            routePath: "/api/v1/tasks",
        },
        get(key: string) {
            if (key === "requestId") return "req-123";
            if (key === "requestStartedAt") return Date.now() - 25;
            return store[key];
        },
        set(key: string, value: unknown) {
            store[key] = value;
        },
    } as any;
}

describe("request logging", () => {
    it("emits structured validation logs with redacted summaries", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ctx = createFakeContext();

        await logValidationFailure(
            ctx,
            "json",
            [{ code: "invalid_type", message: "Expected string", path: "state" }],
            {
                title: "Do not leak me",
                taskIds: ["a", "b", "c"],
                scheduledStart: "2026-03-10",
                state: "ACTIVE",
                Authorization: "Bearer secret",
            },
        );

        expect(warnSpy).toHaveBeenCalledTimes(1);
        // Workers Logs indexes the logged OBJECT directly — assert we pass an
        // object, not a JSON string (which would collapse into one blob field).
        const payload = warnSpy.mock.calls[0][0] as Record<string, any>;
        expect(typeof payload).toBe("object");
        expect(payload).toMatchObject({
            event: "validation_failed",
            level: "warn",
            source: "http",
            requestId: "req-123",
            method: "GET",
            path: "/api/v1/tasks",
            route: "/api/v1/tasks",
            status: 400,
            errorCode: "INVALID_REQUEST",
            issues: [{ code: "invalid_type", message: "Expected string", path: "state" }],
        });
        expect(payload.userHash).toHaveLength(16);
        expect(payload.userHash).not.toBe("user-123");
        expect(payload.input).toEqual({
            taskIdsCount: 3,
            state: "ACTIVE",
        });
        // An explicit failure log marks the request as logged, so the request
        // context middleware will not emit a duplicate `request_completed` line.
        expect(ctx.get("logged")).toBe(true);
        // Sensitive data must not leak
        expect(JSON.stringify(payload)).not.toContain("Bearer secret");
        expect(JSON.stringify(payload)).not.toContain("Do not leak me");
        expect(JSON.stringify(payload)).not.toContain("scheduledStart");
        expect(JSON.stringify(payload)).not.toContain("2026-03-10");
    });
});
