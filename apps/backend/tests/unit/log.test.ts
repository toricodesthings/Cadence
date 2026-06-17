import { describe, expect, it, vi, afterEach } from "vitest";
import { logger, hashIdentifier, issuesFromError, shorten } from "../../src/platform/log";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("logger", () => {
    it("routes levels to the matching console method", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        logger.error("proxy", "upstream_failed", { upstream: "nager", status: 503 });
        logger.warn("http", "validation_failed", { status: 400 });
        logger.info("cron", "overdue_check_started", { tasks: 3 });

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledTimes(1);
    });

    it("logs an indexable object (not a JSON string) so Workers Logs can filter fields", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        logger.error("proxy", "upstream_failed", { upstream: "nominatim", status: 503 });

        const payload = errorSpy.mock.calls[0][0];
        expect(typeof payload).toBe("object");
        expect(payload).toEqual({
            event: "upstream_failed",
            level: "error",
            source: "proxy",
            upstream: "nominatim",
            status: 503,
        });
    });
});

describe("issuesFromError", () => {
    it("flattens an error and its cause into indexable summaries", () => {
        const err = new TypeError("boom", { cause: new Error("root cause") });
        expect(issuesFromError(err)).toEqual([
            { code: "TypeError", message: "boom", path: "" },
            { code: "Error", message: "root cause", path: "cause" },
        ]);
    });

    it("returns undefined for non-Error values so the field is omitted", () => {
        expect(issuesFromError("just a string")).toBeUndefined();
        expect(issuesFromError(undefined)).toBeUndefined();
    });
});

describe("hashIdentifier", () => {
    it("produces a stable 16-char hex prefix that is not the raw value", async () => {
        const hash = await hashIdentifier("user-123");
        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
        expect(hash).not.toBe("user-123");
        expect(await hashIdentifier("user-123")).toBe(hash);
    });
});

describe("shorten", () => {
    it("truncates long values with an ellipsis and leaves short ones intact", () => {
        expect(shorten("short")).toBe("short");
        const long = "x".repeat(200);
        const result = shorten(long);
        expect(result).toHaveLength(120);
        expect(result.endsWith("...")).toBe(true);
    });
});
