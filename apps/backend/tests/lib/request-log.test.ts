import { describe, expect, it, vi } from "vitest";
import { logValidationFailure } from "../../src/lib/request-log";

function createFakeContext() {
    return {
        var: { userId: "user-123" },
        req: {
            method: "GET",
            path: "/api/tasks",
            routePath: "/api/tasks",
        },
        get(key: string) {
            if (key === "requestId") return "req-123";
            if (key === "requestStartedAt") return Date.now() - 25;
            return undefined;
        },
    } as any;
}

describe("request logging", () => {
    it("emits structured validation logs with redacted summaries", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        await logValidationFailure(
            createFakeContext(),
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
        const payload = JSON.parse(String(warnSpy.mock.calls[0][0]));
        expect(payload).toMatchObject({
            event: "validation_failed",
            level: "warn",
            requestId: "req-123",
            method: "GET",
            path: "/api/tasks",
            route: "/api/tasks",
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
        // Sensitive data must not leak
        expect(JSON.stringify(payload)).not.toContain("Bearer secret");
        expect(JSON.stringify(payload)).not.toContain("Do not leak me");
        expect(JSON.stringify(payload)).not.toContain("scheduledStart");
        expect(JSON.stringify(payload)).not.toContain("2026-03-10");
    });
});
