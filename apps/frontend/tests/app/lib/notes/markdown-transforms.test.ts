import { describe, expect, it } from "vitest";
import { applyMarkdownAction } from "../../../../app/lib/notes/markdown-transforms";

const apply = (value: string, start: number, end: number, action: Parameters<typeof applyMarkdownAction>[3]) =>
    applyMarkdownAction(value, start, end, action);

describe("applyMarkdownAction", () => {
    it("wraps the selection and keeps the words selected", () => {
        expect(apply("a b c", 2, 3, "bold")).toEqual({ value: "a **b** c", selectionStart: 4, selectionEnd: 5 });
    });

    it("unwraps a mark that is already there", () => {
        expect(apply("a **b** c", 4, 5, "bold")).toEqual({ value: "a b c", selectionStart: 2, selectionEnd: 3 });
        expect(apply("x *y* z", 3, 4, "italic")).toEqual({ value: "x y z", selectionStart: 2, selectionEnd: 3 });
    });

    it("prefixes every selected line, selecting from after the first prefix", () => {
        expect(apply("one\ntwo", 0, 7, "numbered-list")).toEqual({ value: "1. one\n2. two", selectionStart: 3, selectionEnd: 13 });
    });

    it("inserts a placeholder when nothing is selected", () => {
        expect(apply("", 0, 0, "link")).toEqual({ value: "[Link text](https://)", selectionStart: 1, selectionEnd: 10 });
        expect(apply("ab", 2, 2, "divider")).toEqual({ value: "ab\n\n---\n", selectionStart: 8, selectionEnd: 8 });
    });
});
