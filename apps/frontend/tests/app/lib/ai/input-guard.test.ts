import { describe, expect, it } from "vitest";
import {
    checkMessageText,
    checkMessageParts,
    MAX_MESSAGE_CHARS,
    MAX_PARTS,
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

describe("checkMessageParts", () => {
    it("accepts a small parts array", () => {
        expect(checkMessageParts([{ type: "text", text: "hi" }]).ok).toBe(true);
    });

    it("rejects when over the parts-count cap", () => {
        const parts = Array.from({ length: MAX_PARTS + 1 }, () => ({ type: "text", text: "x" }));
        expect(checkMessageParts(parts).ok).toBe(false);
    });

    it("sums text length across parts and string parts", () => {
        const big = [
            { type: "text", text: "a".repeat(MAX_MESSAGE_CHARS) },
            "b",
        ];
        expect(checkMessageParts(big).ok).toBe(false);
    });

    it("ignores non-text parts when summing length", () => {
        const parts = [{ type: "image", url: "x" }, { type: "text", text: "ok" }];
        expect(checkMessageParts(parts).ok).toBe(true);
    });
});
