import { describe, expect, it } from "vitest";
import { docToMarkdown, docText, isFaithful, markdownToDoc } from "../../../../app/lib/notes/note-markdown";
import { NOTE_TEMPLATES } from "../../../../app/lib/notes/note-templates";

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md));

const faithful: Record<string, string> = {
    "marks and links": "# Title\n\nSecond **bold** *it* ~~strike~~ `code` [link](https://x.com \"t\")\n\nwith hard  \nbreak",
    "nested lists": "- a\n  - b\n    - c\n- d\n\n1. one\n2. two\n   1. nested\n3. three",
    checkboxes: "- [ ] todo\n- [x] done\n  - [ ] sub",
    "quote, rule, fenced code": "> quote\n> more\n\n---\n\n```ts\nconst a = 1;\n\n  indent\n```",
    table: "| a   | b   |\n| --- | --- |\n| 1   | 2   |",
    images: "![alt](https://x.com/i.png)",
    "unicode and escapes": "Unicode ✓ 日本語 \\*escaped\\*",
};

describe("note markdown adapter", () => {
    for (const [name, md] of Object.entries(faithful)) {
        it(`keeps ${name} unchanged through a round trip`, () => {
            expect(isFaithful(md)).toBe(true);
            expect(roundTrip(md)).toBe(md);
        });
    }

    it("flags constructs the editor would drop", () => {
        expect(isFaithful("<div>raw html</div>")).toBe(false);
        expect(isFaithful("Text\n\n[ref]: https://example.com/page")).toBe(false);
    });

    it("keeps all six templates, turning empty checklist lines into real checkboxes", () => {
        for (const t of NOTE_TEMPLATES) {
            const out = roundTrip(t.body);
            expect(isFaithful(t.body, out), t.id).toBe(true);
            expect(out, t.id).not.toContain("\\[");
        }
        expect(roundTrip("### Next\n\n- [ ]\n")).toContain("- [ ]");
    });

    it("counts only visible text", () => {
        const text = docText(markdownToDoc("# Hi\n\n[link text](https://secret.example) **bold**"));
        expect(text).toContain("link text");
        expect(text).not.toContain("secret.example");
        expect(text).not.toContain("**");
    });
});
