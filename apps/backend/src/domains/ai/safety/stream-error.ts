import { AI_ERROR_CODES, type AiErrorCode, type StreamError } from "@cadence/contracts/ai";
import { InvalidToolInputError, NoSuchToolError, RetryError } from "ai";
import { AppError } from "../../../platform/errors";

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
    INVALID_REQUEST: "That request couldn't be processed. Please adjust it and try again.",
    AI_RATE_LIMITED: "The assistant is busy right now. Give it a moment, then try again.",
    AI_IMAGE_LIMITED: "You've sent all the photos and PDFs you can for today. Your text can still go on its own.",
    AI_SPEND_CAPPED: "The assistant is resting until tomorrow. Everything else works.",
    IMAGE_NOT_FOUND: "That file is no longer available.",
    AI_TIMEOUT: "That took longer than expected. Please try again.",
    AI_ABORTED: "Generation stopped.",
    AI_UPSTREAM_UNAVAILABLE: "The assistant is briefly unavailable. Please try again in a moment.",
    AI_TOOL_FAILED: "A step didn't complete. You can try that again.",
    AI_CONTENT_BLOCKED: "I can't help with that one. Let's try something else.",
    INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

function fromCode(code: AiErrorCode, requestId?: string): StreamError {
    return {
        code,
        message: AI_ERROR_MESSAGES[code],
        isRetryable: AI_ERROR_CODES[code].isRetryable,
        requestId,
    };
}

function isTimeoutLike(error: unknown): boolean {
    if (error instanceof Error) {
        const name = error.name.toLowerCase();
        if (name === "aborterror" || name === "timeouterror") return true;
    }
    const text = describe(error).toLowerCase();
    return text.includes("timeout") || text.includes("timed out") || text.includes("aborted");
}

function statusOf(error: unknown): number | undefined {
    if (error && typeof error === "object") {
        const candidate = (error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
        if (typeof candidate === "number") return candidate;
    }
    return undefined;
}

function describe(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    if (typeof error === "string") return error;
    return "";
}

export function streamErrorCause(error: unknown): unknown {
    for (let depth = 0; depth < 8 && RetryError.isInstance(error); depth++) {
        error = error.lastError;
    }
    return error;
}

export function buildStreamError(error: unknown, requestId?: string): StreamError {
    error = streamErrorCause(error);
    if (error instanceof AppError) {
        return {
            code: error.code,
            message: error.message,
            isRetryable: error.isRetryable,
            requestId,
        };
    }

    if (InvalidToolInputError.isInstance(error) || NoSuchToolError.isInstance(error)) {
        return fromCode("AI_TOOL_FAILED", requestId);
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

export function streamErrorToText(err: StreamError): string {
    return JSON.stringify(err);
}
