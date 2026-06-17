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

export interface StreamError {
    code: string;
    message: string;
    isRetryable: boolean;
    requestId?: string;
}

/**
 * Stable error codes → user-facing line (design §9.3). The map drives both the
 * copy and (via the table value) whether a Retry control is offered.
 */
const ERROR_COPY: Record<string, { line: string; isRetryable: boolean }> = {
    AI_RATE_LIMITED: {
        line: "A lot going on right now. Give it a moment, then try again.",
        isRetryable: true,
    },
    AI_TIMEOUT: {
        line: "I lost the thread for a second. Want me to try that again?",
        isRetryable: true,
    },
    AI_UPSTREAM_UNAVAILABLE: {
        line: "I can’t reach my brain right now. Try again in a bit?",
        isRetryable: true,
    },
    AI_TOOL_FAILED: {
        line: "That didn’t go through. Want me to try once more?",
        isRetryable: true,
    },
    INTERNAL_ERROR: {
        line: "Something slipped on my end. Try again?",
        isRetryable: true,
    },
    AI_CONTENT_BLOCKED: {
        line: "I can’t help with that one. Try rewording it a little.",
        isRetryable: false,
    },
    INVALID_REQUEST: {
        line: "That came through oddly. Mind rephrasing?",
        isRetryable: false,
    },
};

const FALLBACK_LINE = "Something went wrong.";

/** Map a known code to its calm user-facing line, or the generic fallback. */
export function errorCodeToLine(code: string | undefined): string {
    if (code && ERROR_COPY[code]) return ERROR_COPY[code].line;
    return FALLBACK_LINE;
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
            const parsed: unknown = JSON.parse(text);
            if (isRecord(parsed)) {
                const code = typeof parsed.code === "string" ? parsed.code : undefined;
                const known = code ? ERROR_COPY[code] : undefined;
                const isRetryable =
                    typeof parsed.isRetryable === "boolean"
                        ? parsed.isRetryable
                        : (known?.isRetryable ?? true);
                return {
                    code: code ?? "INTERNAL_ERROR",
                    // Prefer our calm copy table over the raw backend message.
                    message: known ? known.line : errorCodeToLine(code),
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
        const known = code ? ERROR_COPY[code] : undefined;
        const isRetryable =
            typeof error.isRetryable === "boolean"
                ? error.isRetryable
                : (known?.isRetryable ?? true);
        // `details.requestId` is where the backend AppError envelope carries it.
        const details = isRecord(error.details) ? error.details : undefined;
        const requestId =
            typeof error.requestId === "string"
                ? error.requestId
                : typeof details?.requestId === "string"
                  ? (details.requestId as string)
                  : undefined;
        return {
            code: code ?? "INTERNAL_ERROR",
            message: known ? known.line : errorCodeToLine(code),
            isRetryable,
            requestId,
        };
    }
    return { code: "INTERNAL_ERROR", message: FALLBACK_LINE, isRetryable: true };
}
