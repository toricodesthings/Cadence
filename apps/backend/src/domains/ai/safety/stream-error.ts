/**
 * Mid-stream error contract (docs/ai_upgrade/09 §4).
 *
 * Once streaming has begun a failure can no longer use the JSON `AppError`
 * envelope — the HTTP status is already sent. Instead the AI SDK `onError`
 * callback returns a STRING that is carried as the `error` part of the UI message
 * stream. The frontend parses that JSON to render an inline error bubble with a
 * Retry control. This module maps any thrown/stream error into a USER-SAFE shape:
 * calming, plain language, never raw provider/SQL text.
 *
 * Pre-stream errors (validation, auth, rate limit before the stream opens) keep
 * using `AppError` + `formatErrorResponse` — that path is unchanged.
 */

import { AppError } from "../../../platform/errors";

export interface StreamError {
    code: string;
    message: string;
    isRetryable: boolean;
    requestId?: string;
}

interface ErrorCodeSpec {
    /** HTTP-equivalent status, or null for in-stream-only failures. */
    status: number | null;
    isRetryable: boolean;
    /** User-safe, calming default message. */
    message: string;
}

/**
 * Stable error codes the client switches on (docs/ai_upgrade/09 §4.2). The client
 * shows a Retry control for `isRetryable` codes and guidance only otherwise.
 */
export const AI_ERROR_CODES: Record<string, ErrorCodeSpec> = {
    INVALID_REQUEST: {
        status: 400,
        isRetryable: false,
        message: "That request couldn't be processed. Please adjust it and try again.",
    },
    AI_RATE_LIMITED: {
        status: 429,
        isRetryable: true,
        message: "You're moving a little fast. Give it a moment, then try again.",
    },
    AI_TIMEOUT: {
        status: 504,
        isRetryable: true,
        message: "That took longer than expected. Please try again.",
    },
    AI_ABORTED: {
        status: null,
        isRetryable: true,
        message: "Generation stopped.",
    },
    AI_UPSTREAM_UNAVAILABLE: {
        status: 503,
        isRetryable: true,
        message: "The assistant is briefly unavailable. Please try again in a moment.",
    },
    AI_TOOL_FAILED: {
        status: null,
        isRetryable: true,
        message: "A step didn't complete. You can try that again.",
    },
    AI_CONTENT_BLOCKED: {
        status: null,
        isRetryable: false,
        message: "I can't help with that one. Let's try something else.",
    },
    INTERNAL_ERROR: {
        status: 500,
        isRetryable: true,
        message: "Something went wrong on our side. Please try again.",
    },
} as const;

/** Build a StreamError from a known code, optionally overriding the message. */
function fromCode(code: keyof typeof AI_ERROR_CODES, requestId?: string, message?: string): StreamError {
    const spec = AI_ERROR_CODES[code];
    return {
        code,
        message: message ?? spec.message,
        isRetryable: spec.isRetryable,
        requestId,
    };
}

/** True when an error looks like a timeout or an AbortController-driven cancel. */
function isTimeoutLike(error: unknown): boolean {
    if (error instanceof Error) {
        const name = error.name.toLowerCase();
        if (name === "aborterror" || name === "timeouterror") return true;
    }
    const text = describe(error).toLowerCase();
    return text.includes("timeout") || text.includes("timed out") || text.includes("aborted");
}

/** Extract an HTTP-ish status code from an arbitrary error shape, if present. */
function statusOf(error: unknown): number | undefined {
    if (error && typeof error === "object") {
        const candidate =
            (error as { status?: unknown }).status ??
            (error as { statusCode?: unknown }).statusCode;
        if (typeof candidate === "number") return candidate;
    }
    return undefined;
}

/** Best-effort string view of an unknown error (used only for matching). */
function describe(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    if (typeof error === "string") return error;
    return "";
}

/**
 * Map an arbitrary thrown/stream error into a user-safe `StreamError`. Detection
 * order:
 *  1. `AppError` → reuse its code/message/isRetryable (it is already user-safe).
 *  2. Timeout / abort → `AI_TIMEOUT`.
 *  3. Upstream 5xx (or 429) → `AI_UPSTREAM_UNAVAILABLE` / `AI_RATE_LIMITED`.
 *  4. Anything else → `INTERNAL_ERROR` (raw text is never reflected).
 */
export function buildStreamError(error: unknown, requestId?: string): StreamError {
    if (error instanceof AppError) {
        return {
            code: error.code,
            message: error.message,
            isRetryable: error.isRetryable,
            requestId,
        };
    }

    if (isTimeoutLike(error)) {
        return fromCode("AI_TIMEOUT", requestId);
    }

    const status = statusOf(error);
    if (status === 429) {
        return fromCode("AI_RATE_LIMITED", requestId);
    }
    if (status !== undefined && status >= 500) {
        return fromCode("AI_UPSTREAM_UNAVAILABLE", requestId);
    }

    return fromCode("INTERNAL_ERROR", requestId);
}

/**
 * Serialize a `StreamError` to the string the AI SDK `onError` callback returns,
 * so it is carried as the `error` part text in the UI message stream. The frontend
 * JSON-parses this to render the Retry control.
 */
export function streamErrorToText(err: StreamError): string {
    return JSON.stringify(err);
}
