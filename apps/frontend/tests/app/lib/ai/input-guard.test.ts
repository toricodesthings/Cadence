import { describe, expect, it } from "vitest";
import {
    checkMessageText,
    MAX_MESSAGE_CHARS,
} from "../../../../app/lib/ai/input-guard";

describe("checkMessageText", () => {
    it("accepts text at or below the char cap", () => {
        expect(checkMessageText("hello").ok).toBe(true);
        expect(checkMessageText("a".repeat(MAX_MESSAGE_CHARS)).ok).toBe(true);
    });

    it("rejects text over the char cap with a calm reason", () => {
        const res = checkMessageText("a".repeat(MAX_MESSAGE_CHARS + 1));
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/trim it a little/i);
    });
});
