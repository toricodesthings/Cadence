import { describe, expect, it } from "vitest";
import { parseDuration } from "@cadence/nlp/parse";

const minutes = (text: string, maxMinutes?: number) => (parseDuration(text, maxMinutes ? { maxMinutes } : undefined).entities[0]?.normalizedValue as { minutes?: number } | undefined)?.minutes;

describe("parseDuration maxMinutes", () => {
    it("a task title stops at 8 hours; an answer to 'how long did it take?' goes to 24", () => {
        expect(minutes("9h")).toBeUndefined();
        expect(minutes("8h")).toBe(480);
        expect(minutes("9h", 1440)).toBe(540);
        expect(minutes("25h", 1440)).toBeUndefined();
    });
});
