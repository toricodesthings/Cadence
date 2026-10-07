import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { noteExtensions, markdownToDoc, docToMarkdown } from "../../../app/lib/notes/note-markdown";
import { NoteFind, getFind, replaceAll, setFind } from "../../../app/lib/notes/note-find";
import { extractNoteOutline, findHeading, currentHeadingId } from "../../../app/lib/notes/note-outline";
import { applyRemoteDoc } from "../../../app/components/tasks/note/note-selection";
import { filterSlashCommands, markState, runNoteCommand, SLASH_COMMANDS } from "../../../app/components/tasks/note/note-commands";

let editor: Editor | null = null;
const make = (md: string) => (editor = new Editor({ extensions: [...noteExtensions(), NoteFind], content: markdownToDoc(md) }));
afterEach(() => editor?.destroy());

describe("find and replace", () => {
    it("finds matches as decorations without touching the document", () => {
        const e = make("one two one\n\nONE");
        const before = docToMarkdown(e.getJSON());
        setFind(e, { query: "one" });
        expect(getFind(e).matches).toHaveLength(3);
        expect(docToMarkdown(e.getJSON())).toBe(before);
    });

    it("replaces all in one undoable step", () => {
        const e = make("cat sat\n\ncat");
        setFind(e, { query: "cat" });
        expect(replaceAll(e, "dog")).toBe(2);
        expect(docToMarkdown(e.getJSON())).toBe("dog sat\n\ndog");
        e.commands.undo();
        expect(docToMarkdown(e.getJSON())).toBe("cat sat\n\ncat");
    });
});

describe("outline", () => {
    it("lists headings from the document, ignoring fenced lookalikes, with distinct ids for repeats", () => {
        const e = make("# A\n\ntext\n\n## B\n\n```\n# not a heading\n```\n\n## B");
        const outline = extractNoteOutline(e.state.doc);
        expect(outline.map((h) => [h.level, h.text])).toEqual([[1, "A"], [2, "B"], [2, "B"]]);
        expect(new Set(outline.map((h) => h.id)).size).toBe(3);
        expect(findHeading(outline, "B")).toBe(outline[1]);
        expect(currentHeadingId(outline, outline[2].pos + 2)).toBe(outline[2].id);
    });
});

describe("commands", () => {
    it("bolds the selection as a mark, not syntax, and reports mixed selections", () => {
        const e = make("plain and more");
        e.commands.setTextSelection({ from: 1, to: 6 });
        runNoteCommand(e, "bold");
        expect(docToMarkdown(e.getJSON())).toBe("**plain** and more");
        e.commands.setTextSelection({ from: 1, to: 12 });
        expect(markState(e, "bold")).toBe("mixed");
    });

    it("keeps the six slash block ids and finds templates by the word template", () => {
        expect(SLASH_COMMANDS.slice(0, 6).map((c) => c.id)).toEqual(["heading", "bullet-list", "numbered-list", "checklist", "quote", "divider"]);
        expect(filterSlashCommands("template").map((c) => c.id)).toEqual(["checklist", "bullets", "meeting", "brainstorm", "decision", "next-steps"].map((t) => `template:${t}`));
        expect(filterSlashCommands("zzzz")).toEqual([]);
    });
});

describe("remote text", () => {
    it("applies only the changed span and never adds to undo history", () => {
        const e = make("first\n\nsecond");
        e.commands.setTextSelection(3);
        applyRemoteDoc(e, e.schema.nodeFromJSON(markdownToDoc("first\n\nsecond, extended")));
        expect(docToMarkdown(e.getJSON())).toBe("first\n\nsecond, extended");
        expect(e.state.selection.from).toBe(3);
        expect(e.can().undo()).toBe(false);
    });
});
