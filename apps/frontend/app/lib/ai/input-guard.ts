import { MAX_MESSAGE_CHARS as SHARED_MAX_MESSAGE_CHARS } from "@cadence/contracts/ai";

export const MAX_MESSAGE_CHARS = SHARED_MAX_MESSAGE_CHARS;

export interface InputGuardResult {
    ok: boolean;
    reason?: string;
}

export function checkMessageText(text: string): InputGuardResult {
    if (text.length > MAX_MESSAGE_CHARS) {
        return {
            ok: false,
            reason: "That’s a lot at once — trim it a little and I’ll take it.",
        };
    }
    return { ok: true };
}
