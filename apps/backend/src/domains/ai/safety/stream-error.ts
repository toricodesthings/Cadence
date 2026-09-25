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

import { AI_ERROR_CODES, type AiErrorCode, type StreamError } from "@cadence/contracts/ai";
import { AppError } from "../../../platform/errors";

/**
 * User-safe, calming wire message per code. The frontend shows its own copy for
 * known codes, so these are the fallback for other clients.
 */
export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
    INVALID_REQUEST: "That request couldn't be processed. Please adjust it and try again.",
    AI_RATE_LIMITED: "You're moving a little fast. Give it a moment, then try again.",
    AI_IMAGE_LIMITED: "You've sent all the images you can for today. Your text can still go on its own.",
    IMAGE_NOT_FOUND: "That image is no longer available.",
    AI_TIMEOUT: "That took longer than expected. Please try again.",
    AI_ABORTED: "Generation stopped.",
    AI_UPSTREAM_UNAVAILABLE: "The assistant is briefly unavailable. Please try again in a moment.",
    AI_TOOL_FAILED: "A step didn't complete. You can try that again.",
    AI_CONTENT_BLOCKED: "I can't help with that one. Let's try something else.",
    INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

/** Build a StreamError from a known code. */
function fromCode(code: AiErrorCode, requestId?: string): StreamError {
    return {
        code,
        message: AI_ERROR_MESSAGES[code],
        isRetryable: AI_ERROR_CODES[code].isRetryable,
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
