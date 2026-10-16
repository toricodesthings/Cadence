/**
 * Client-side input caps for the AI chat — a fail-fast mirror of the backend
 * AI-specific guard so the user gets a calm inline notice BEFORE the request,
 * instead of eating a raw 400 (ai_frontend.md §4.2).
 *
 * Both halves read the SAME constants from @cadence/contracts/ai — the backend
 * guard rejects with 400, this guard blocks the send inline. One edit, both sides.
 */
import { MAX_MESSAGE_CHARS as SHARED_MAX_MESSAGE_CHARS } from "@cadence/contracts/ai";

/** Max summed length of all text parts in a single message. */
export const MAX_MESSAGE_CHARS = SHARED_MAX_MESSAGE_CHARS;

export interface InputGuardResult {
    ok: boolean;
    /** A calm, user-facing reason when `ok` is false (design §9.4 "Input too long"). */
    reason?: string;
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
