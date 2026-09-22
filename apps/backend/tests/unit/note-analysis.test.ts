import { describe, expect, it } from "vitest";
import { countHeadings, countWords, generateExcerpt } from "../../src/domains/notes/note-analysis";

describe("generateExcerpt", () => {
    it("strips markdown to a plain one-line preview", () => {
        const body = "## Key Points\n\n- **Retention** up 14%\n1. See [the dashboard](https://x.io)\n\nRun `npm test` first.";

        expect(generateExcerpt(body)).toBe("Key Points Retention up 14% See the dashboard Run  first.");
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

describe("countWords / countHeadings", () => {
    it.each([
        ["", 0],
        ["   \n ", 0],
        ["one", 1],
        ["one  two\nthree\tfour", 4],
    ])("countWords(%j) = %i", (body, n) => {
        expect(countWords(body)).toBe(n);
    });

    it("counts only real headings (1–6 #s followed by a space, at line start)", () => {
        expect(countHeadings("# A\ntext #not\n###### F\n####### seven\n#nospace")).toBe(2);
    });
});
