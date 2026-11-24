import { describe, expect, it } from "vitest";
import { countHeadings, countWords } from "@cadence/domain/notes";

describe("countWords", () => {
    it.each([
        ["", 0],
        ["   \n ", 0],
        ["one", 1],
        ["a  b\nc", 3],
        ["one  two\nthree\tfour", 4],
    ])("countWords(%j) = %i", (body, n) => {
        expect(countWords(body)).toBe(n);
    });
});

describe("countHeadings", () => {
    it("counts only real headings (1–6 #s followed by a space, at line start)", () => {
        expect(countHeadings("# A\ntext #not\n###### F\n####### seven\n#nospace")).toBe(2);
    });
});
