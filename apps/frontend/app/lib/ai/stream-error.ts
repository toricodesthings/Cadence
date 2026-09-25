/**
 * Parse + present AI errors (ai_frontend.md §8.1–8.2, design §9.3).
 *
 * Two entry points, one shape:
 *  - Mid-stream: the backend emits a typed error PART whose text is
 *    JSON `{ code, message, isRetryable, requestId }`. We parse that text.
 *  - Pre-stream: an HTTP non-2xx `AppError` envelope surfaces through
 *    `useChat`'s `onError` as an `Error` (often `ApiErrorResponse`). We coerce it.
 *
 * The `code → copy` table is the design-spec microcopy (§9.3): calm, no urgency
 * theater, never the raw requestId in the body.
 */

import { AI_ERROR_CODES, type AiErrorCode, type StreamError as WireStreamError } from "@cadence/contracts/ai";

/** The wire shape, but `code` may also be one the client made up (`UNPARSEABLE_ERROR`). */
export type StreamError = Omit<WireStreamError, "code"> & { code: string };

/** Stable error codes → calm user-facing line (design §9.3). Retry comes from `AI_ERROR_CODES`. */
const ERROR_LINES: Partial<Record<AiErrorCode, string>> = {
    AI_RATE_LIMITED: "A lot going on right now. Give it a moment, then try again.",
    AI_IMAGE_LIMITED: "That’s all the images for today. Your words can still go on their own.",
    IMAGE_NOT_FOUND: "That image expired. Attach it again, or send without it.",
    AI_TIMEOUT: "I lost the thread for a second. Want me to try that again?",
    AI_UPSTREAM_UNAVAILABLE: "I can’t reach my brain right now. Try again in a bit?",
    AI_TOOL_FAILED: "That didn’t go through. Want me to try once more?",
    INTERNAL_ERROR: "Something slipped on my end. Try again?",
    AI_CONTENT_BLOCKED: "I can’t help with that one. Try rewording it a little.",
    INVALID_REQUEST: "That came through oddly. Mind rephrasing?",
};

function isAiCode(code: string | undefined): code is AiErrorCode {
    return code !== undefined && Object.hasOwn(AI_ERROR_CODES, code);
}

const FALLBACK_LINE = "Something went wrong.";

/** Map a known code to its calm user-facing line, or the generic fallback. */
export function errorCodeToLine(code: string | undefined): string {
    return (isAiCode(code) && ERROR_LINES[code]) || FALLBACK_LINE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Parse the JSON text carried by a mid-stream error part into a `StreamError`.
 * Falls back to a generic, retryable-unknown error if the text is not the
 * expected JSON shape (design §9.3 "fallback (parse fail)").
 */
export function parseStreamErrorText(text: string | undefined | null): StreamError {
    if (typeof text === "string" && text.trim()) {
        try {
            const json: unknown = JSON.parse(text);
            // A pre-stream HTTP failure arrives as the whole `{ error: {...} }` envelope.
            const parsed = isRecord(json) && isRecord(json.error) ? json.error : json;
            if (isRecord(parsed)) {
                const code = typeof parsed.code === "string" ? parsed.code : undefined;
                const isRetryable =
                    typeof parsed.isRetryable === "boolean"
                        ? parsed.isRetryable
                        : isAiCode(code) ? AI_ERROR_CODES[code].isRetryable : true;
                return {
                    code: code ?? "INTERNAL_ERROR",
                    // Our calm copy, never the raw backend message.
                    message: errorCodeToLine(code),
                    isRetryable,
                    requestId:
                        typeof parsed.requestId === "string" ? parsed.requestId : undefined,
                };
            }
        } catch {
            // fall through to generic
        }
    }
    return { code: "INTERNAL_ERROR", message: FALLBACK_LINE, isRetryable: true };
}

/**
 * Coerce a pre-stream `Error` (often an `ApiErrorResponse` with `code` /
 * `isRetryable` / `requestId`) into a `StreamError` using the same copy table.
 */
export function streamErrorFromError(error: unknown): StreamError {
    if (isRecord(error)) {
        const code = typeof error.code === "string" ? error.code : undefined;
        const isRetryable =
            typeof error.isRetryable === "boolean"
                ? error.isRetryable
                : isAiCode(code) ? AI_ERROR_CODES[code].isRetryable : true;
        return {
            code: code ?? "INTERNAL_ERROR",
            message: errorCodeToLine(code),
            isRetryable,
            requestId: typeof error.requestId === "string" ? error.requestId : undefined,
        };
    }
    return { code: "INTERNAL_ERROR", message: FALLBACK_LINE, isRetryable: true };
}
