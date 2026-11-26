import { AI_ERROR_CODES, type AiErrorCode, type StreamError as WireStreamError } from "@cadence/contracts/ai";

export type StreamError = Omit<WireStreamError, "code"> & { code: string };

const ERROR_LINES: Partial<Record<AiErrorCode, string>> = {
    AI_RATE_LIMITED: "A lot going on right now. Give it a moment, then try again.",
    AI_IMAGE_LIMITED: "That’s all the photos and PDFs for today. Your words can still go on their own.",
    AI_SPEND_CAPPED: "The assistant is resting until tomorrow. Everything else works.",
    IMAGE_NOT_FOUND: "That file expired. Attach it again, or send without it.",
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

export function errorCodeToLine(code: string | undefined): string {
    return (isAiCode(code) && ERROR_LINES[code]) || FALLBACK_LINE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function parseStreamErrorText(text: string | undefined | null): StreamError {
    if (typeof text === "string" && text.trim()) {
        try {
            const json: unknown = JSON.parse(text);
            const parsed = isRecord(json) && isRecord(json.error) ? json.error : json;
            if (isRecord(parsed)) {
                const code = typeof parsed.code === "string" ? parsed.code : undefined;
                const isRetryable =
                    typeof parsed.isRetryable === "boolean"
                        ? parsed.isRetryable
                        : isAiCode(code)
                          ? AI_ERROR_CODES[code].isRetryable
                          : true;
                return {
                    code: code ?? "INTERNAL_ERROR",
                    message: errorCodeToLine(code),
                    isRetryable,
                    requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined,
                };
            }
        } catch {}
    }
    return { code: "INTERNAL_ERROR", message: FALLBACK_LINE, isRetryable: true };
}

export function streamErrorFromError(error: unknown): StreamError {
    if (isRecord(error)) {
        const code = typeof error.code === "string" ? error.code : undefined;
        const isRetryable =
            typeof error.isRetryable === "boolean"
                ? error.isRetryable
                : isAiCode(code)
                  ? AI_ERROR_CODES[code].isRetryable
                  : true;
        return {
            code: code ?? "INTERNAL_ERROR",
            message: errorCodeToLine(code),
            isRetryable,
            requestId: typeof error.requestId === "string" ? error.requestId : undefined,
        };
    }
    return { code: "INTERNAL_ERROR", message: FALLBACK_LINE, isRetryable: true };
}
