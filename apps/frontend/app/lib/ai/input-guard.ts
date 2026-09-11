/**
 * Client-side input caps for the AI chat — a fail-fast mirror of the backend
 * AI-specific guard so the user gets a calm inline notice BEFORE the request,
 * instead of eating a raw 400 (ai_frontend.md §4.2).
 *
 * Both halves read the SAME constants from @cadence/contracts/ai — the backend
 * guard rejects with 400, this guard blocks the send inline. One edit, both sides.
 */
import {
    MAX_MESSAGE_CHARS as SHARED_MAX_MESSAGE_CHARS,
    MAX_PARTS_PER_MESSAGE,
} from "@cadence/contracts/ai";

/** Max summed length of all text parts in a single message. */
export const MAX_MESSAGE_CHARS = SHARED_MAX_MESSAGE_CHARS;

/** Max number of `parts` entries in a single message. */
export const MAX_PARTS = MAX_PARTS_PER_MESSAGE;

export interface InputGuardResult {
    ok: boolean;
    /** A calm, user-facing reason when `ok` is false (design §9.4 "Input too long"). */
    reason?: string;
}

/** Text length contributed by a single UI message part. */
function textLengthOfPart(part: unknown): number {
    if (typeof part === "string") return part.length;
    if (part && typeof part === "object") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text.length;
    }
    return 0;
}

/**
 * Validate a draft message (plain text) the user is about to send. Returns
 * `{ ok: false, reason }` when it exceeds the char cap so the composer can show
 * an inline notice and block the send.
 */
export function checkMessageText(text: string): InputGuardResult {
    if (text.length > MAX_MESSAGE_CHARS) {
        return {
            ok: false,
            reason: "That’s a lot at once — trim it a little and I’ll take it.",
        };
    }
    return { ok: true };
}

/**
 * Validate an assembled UIMessage-like value (used when we have parts already).
 * Enforces both the parts-count cap and the summed-char cap.
 */
export function checkMessageParts(parts: readonly unknown[]): InputGuardResult {
    if (parts.length > MAX_PARTS) {
        return {
            ok: false,
            reason: "That’s a lot at once — trim it a little and I’ll take it.",
        };
    }
    let totalChars = 0;
    for (const part of parts) totalChars += textLengthOfPart(part);
    if (totalChars > MAX_MESSAGE_CHARS) {
        return {
            ok: false,
            reason: "That’s a lot at once — trim it a little and I’ll take it.",
        };
    }
    return { ok: true };
}
