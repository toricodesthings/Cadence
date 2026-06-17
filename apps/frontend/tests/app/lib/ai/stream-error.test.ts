import { describe, expect, it } from "vitest";
import {
    parseStreamErrorText,
    streamErrorFromError,
    errorCodeToLine,
} from "../../../../app/lib/ai/stream-error";

describe("parseStreamErrorText", () => {
    it("parses a typed mid-stream error part and prefers the calm copy line", () => {
        const text = JSON.stringify({
            code: "AI_TIMEOUT",
            message: "raw upstream message",
            isRetryable: true,
            requestId: "req_123",
        });
        const err = parseStreamErrorText(text);
        expect(err.code).toBe("AI_TIMEOUT");
        expect(err.isRetryable).toBe(true);
        expect(err.requestId).toBe("req_123");
        // Calm copy table wins over the raw backend message.
        expect(err.message).toBe(errorCodeToLine("AI_TIMEOUT"));
        expect(err.message).not.toBe("raw upstream message");
    });

    it("honors non-retryable codes", () => {
        const err = parseStreamErrorText(JSON.stringify({ code: "AI_CONTENT_BLOCKED" }));
        expect(err.code).toBe("AI_CONTENT_BLOCKED");
        expect(err.isRetryable).toBe(false);
    });

    it("falls back to a generic retryable error on unparseable text", () => {
        const err = parseStreamErrorText("not json");
        expect(err.code).toBe("INTERNAL_ERROR");
        expect(err.isRetryable).toBe(true);
        expect(err.message).toBe("Something went wrong.");
    });

    it("falls back on empty / nullish input", () => {
        expect(parseStreamErrorText(undefined).isRetryable).toBe(true);
        expect(parseStreamErrorText("").code).toBe("INTERNAL_ERROR");
    });

    it("defaults isRetryable from the code table when absent", () => {
        const err = parseStreamErrorText(JSON.stringify({ code: "INVALID_REQUEST" }));
        expect(err.isRetryable).toBe(false);
    });
});

describe("streamErrorFromError (pre-stream HTTP)", () => {
    it("coerces an AppError-like object using the copy table", () => {
        const err = streamErrorFromError({
            code: "AI_RATE_LIMITED",
            isRetryable: true,
            details: { requestId: "req_abc" },
        });
        expect(err.code).toBe("AI_RATE_LIMITED");
        expect(err.message).toBe(errorCodeToLine("AI_RATE_LIMITED"));
        expect(err.requestId).toBe("req_abc");
    });

    it("reads a top-level requestId when present", () => {
        const err = streamErrorFromError({ code: "INTERNAL_ERROR", requestId: "req_top" });
        expect(err.requestId).toBe("req_top");
    });

    it("falls back for a non-object error", () => {
        const err = streamErrorFromError("boom");
        expect(err.code).toBe("INTERNAL_ERROR");
        expect(err.isRetryable).toBe(true);
    });
});

describe("errorCodeToLine", () => {
    it("maps known codes and falls back for unknown", () => {
        expect(errorCodeToLine("AI_UPSTREAM_UNAVAILABLE")).toMatch(/reach my brain/i);
        expect(errorCodeToLine("SOMETHING_NEW")).toBe("Something went wrong.");
        expect(errorCodeToLine(undefined)).toBe("Something went wrong.");
    });
});
