import { describe, expect, it } from "vitest";
import { mergeNotes } from "../../../../app/lib/notes/note-merge";

const base = "# Plan\n\nfirst\n\nsecond\n\nthird";

describe("mergeNotes", () => {
    it("takes whichever side changed when the other didn't", () => {
        expect(mergeNotes(base, base, "x")).toEqual({ ok: true, body: "x" });
        expect(mergeNotes(base, "y", base)).toEqual({ ok: true, body: "y" });
        expect(mergeNotes(base, "z", "z")).toEqual({ ok: true, body: "z" });
    });

    it("combines edits to separate paragraphs once, leaving the rest alone", () => {
        const local = base.replace("first", "first, edited here");
        const remote = base.replace("third", "third, edited there");
        expect(mergeNotes(base, local, remote)).toEqual({ ok: true, body: "# Plan\n\nfirst, edited here\n\nsecond\n\nthird, edited there" });
    });

    it("keeps a repeated paragraph a person typed on purpose", () => {
        const local = `${base}\n\nsame line`;
        const remote = `${base}\n\nsame line\n\nsame line`;
        expect(mergeNotes(base, local, remote).ok).toBe(false);
    });

    it("refuses overlapping edits, delete-versus-edit, and competing insertions", () => {
        expect(mergeNotes(base, base.replace("second", "A"), base.replace("second", "B")).ok).toBe(false);
        expect(mergeNotes(base, base.replace("\n\nsecond", ""), base.replace("second", "B")).ok).toBe(false);
        expect(mergeNotes(base, base.replace("first\n", "first\nA\n"), base.replace("first\n", "first\nB\n")).ok).toBe(false);
    });

    it("accepts the identical change made on both sides", () => {
        const both = base.replace("second", "same");
        expect(mergeNotes(base, both.replace("third", "T"), both)).toEqual({ ok: true, body: both.replace("third", "T") });
    });

    it("won't produce an unbalanced code fence", () => {
        const withCode = "intro\n\n```\ncode\n```\n\nend";
        expect(mergeNotes(withCode, withCode.replace("intro", "```\nintro"), withCode.replace("end", "fin")).ok).toBe(false);
    });
});
