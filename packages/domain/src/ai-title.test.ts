import { describe, expect, it } from "vitest";
import {
    deriveFallbackTitle,
    normalizeTitle,
    PHOTO_CONVERSATION,
    UNTITLED_CONVERSATION,
    TITLE_MAX_CHARS,
} from "./ai-title";

describe("deriveFallbackTitle", () => {
    it("returns the placeholder for empty/whitespace input", () => {
        expect(deriveFallbackTitle("")).toBe(UNTITLED_CONVERSATION);
        expect(deriveFallbackTitle("   \n\t ")).toBe(UNTITLED_CONVERSATION);
    });

    it("titles a photo-only first message", () => {
        expect(deriveFallbackTitle("", true)).toBe(PHOTO_CONVERSATION);
        expect(deriveFallbackTitle("whiteboard", true)).toBe("Whiteboard");
    });

    it("capitalizes the first character and collapses whitespace", () => {
        expect(deriveFallbackTitle("remind me   to call\nthe IRS")).toBe("Remind me to call the IRS");
    });

    it("clamps to the word budget with an ellipsis", () => {
        expect(deriveFallbackTitle("one two three four five six seven eight")).toBe(
            "One two three four five six…",
        );
    });

    it("clamps overly long single-line input to the char budget", () => {
        const out = deriveFallbackTitle("supercalifragilisticexpialidocious antidisestablishmentarianism");
        expect(out.length).toBeLessThanOrEqual(TITLE_MAX_CHARS + 1); // +1 for the ellipsis
        expect(out.endsWith("…")).toBe(true);
    });
});

describe("normalizeTitle", () => {
    it("strips wrapping quotes and trailing punctuation", () => {
        expect(normalizeTitle('"Plan My Taxes."')).toBe("Plan My Taxes");
        expect(normalizeTitle("“Weekly Review”")).toBe("Weekly Review");
        expect(normalizeTitle("`Groceries Run`")).toBe("Groceries Run");
    });

    it("returns empty string when nothing usable remains", () => {
        expect(normalizeTitle('"""')).toBe("");
        expect(normalizeTitle("   ")).toBe("");
    });

    it("clamps a too-long model title", () => {
        const out = normalizeTitle("This Title Is Way Too Long For A Conversation Header Indeed");
        expect(out.endsWith("…")).toBe(true);
    });
});
