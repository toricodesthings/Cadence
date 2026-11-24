import { describe, expect, it } from "vitest";
import { generateExcerpt } from "../../src/domains/notes/note-analysis";

describe("generateExcerpt", () => {
    it("strips markdown to a plain one-line preview", () => {
        const body =
            "## Key Points\n\n- **Retention** up 14%\n1. See [the dashboard](https://x.io)\n\nRun `npm test` first.";

        expect(generateExcerpt(body)).toBe("Key Points Retention up 14% See the dashboard Run npm test first.");
    });

    it("cuts long text at a word boundary and marks the cut", () => {
        const excerpt = generateExcerpt("word ".repeat(40), 20);

        expect(excerpt).toBe("word word word word…");
    });

    it("hard-cuts a single word longer than the limit", () => {
        expect(generateExcerpt("x".repeat(30), 10)).toBe(`${"x".repeat(10)}…`);
    });

    it("leaves short text as-is", () => {
        expect(generateExcerpt("short note")).toBe("short note");
    });
});

describe("linesOf", () => {
    it("keeps a leading year and strips markdown", async () => {
        const { linesOf } = await import("../../src/domains/ai/memory/note-learn");
        expect(linesOf("2027 is when my course finishes.\n**Bold** and [a link](https://x.test) here")).toEqual([
            "2027 is when my course finishes.",
            "Bold and a link here",
        ]);
    });
});
