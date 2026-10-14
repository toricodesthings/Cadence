import { describe, expect, it } from "vitest";
import { APICallError, InvalidToolInputError, NoSuchToolError, RetryError } from "ai";
import { buildStreamError, streamErrorCause } from "../../src/domains/ai/safety/stream-error";
import { AppError } from "../../src/platform/errors";

const httpError = (status: number) => Object.assign(new Error("provider said: key sk-live-123 rejected"), { statusCode: status });
const named = (name: string) => Object.assign(new Error("x"), { name });

describe("buildStreamError", () => {
    it.each([[429, "AI_RATE_LIMITED"], [503, "AI_UPSTREAM_UNAVAILABLE"]] as const)("unwraps exhausted SDK retries for %s", (statusCode, code) => {
        const cause = new APICallError({ message: "provider secret", url: "https://example.test", requestBodyValues: {}, statusCode, responseBody: "private response" });
        const exhausted = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [cause, cause, cause] });
        const nested = new RetryError({ message: "Retry failed", reason: "errorNotRetryable", errors: [exhausted] });
        expect(streamErrorCause(nested)).toBe(cause);
        const result = buildStreamError(nested, "req-1");
        expect(result).toMatchObject({ code, requestId: "req-1", isRetryable: true });
        expect(JSON.stringify(result)).not.toMatch(/secret|private/);
    });

    it("leaves unknown retry causes internal and bounds cyclic wrappers", () => {
        const error = new RetryError({ message: "retry", reason: "maxRetriesExceeded", errors: [new Error("bug")] });
        expect(buildStreamError(error).code).toBe("INTERNAL_ERROR");
        Object.assign(error, { lastError: error });
        expect(buildStreamError(error).code).toBe("INTERNAL_ERROR");
    });

    it.each([
        ["a wrong tool input", new InvalidToolInputError({ toolName: "t", toolInput: "{}", cause: new Error("bad") }), "AI_TOOL_FAILED"],
        ["an unknown tool", new NoSuchToolError({ toolName: "t" }), "AI_TOOL_FAILED"],
        ["an AbortError", named("AbortError"), "AI_TIMEOUT"],
        ["a TimeoutError", named("TimeoutError"), "AI_TIMEOUT"],
        ["a 'timed out' message", new Error("request timed out"), "AI_TIMEOUT"],
        ["an upstream 429", httpError(429), "AI_RATE_LIMITED"],
        ["an upstream 503", httpError(503), "AI_UPSTREAM_UNAVAILABLE"],
        ["an upstream 400", httpError(400), "INTERNAL_ERROR"],
        ["a plain bug", new TypeError("cannot read x of undefined"), "INTERNAL_ERROR"],
        ["a thrown string", "boom", "INTERNAL_ERROR"],
    ])("maps %s to %s, with our own copy and never the raw text", (_label, error, code) => {
        const out = buildStreamError(error, "req-1");

        expect(out).toMatchObject({ code, requestId: "req-1", isRetryable: expect.any(Boolean) });
        expect(JSON.stringify(out)).not.toMatch(/sk-live|undefined|boom|bad/);
    });

    it("passes an AppError through as is, since its message is already user-safe", () => {
        expect(buildStreamError(new AppError(400, "IMAGE_NOT_FOUND", "That image expired", false))).toEqual({
            code: "IMAGE_NOT_FOUND",
            message: "That image expired",
            isRetryable: false,
            requestId: undefined,
        });
    });
});
