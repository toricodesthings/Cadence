/**
 * The note editor's one command registry: stable ids, labels, shortcut hints,
 * eligibility and execution. Toolbars, the More menu, slash commands and keyboard
 * handlers all call these, so a capability exists once.
 */
import type { Editor } from "@tiptap/core";
import {
    Bold, Italic, Strikethrough, Code2, RemoveFormatting, Heading1, Heading2, Heading3, Pilcrow, List, ListOrdered, ListTodo,
    Quote, Minus, SquareCode, Link2, Table2, IndentIncrease, IndentDecrease, Undo2, Redo2, FileText, CalendarDays, Lightbulb,
    CheckCircle2, Search, ClipboardCopy, Download, FileCode, ListChecks, type LucideIcon,
} from "lucide-react";
import { MOD_KEY } from "../../../lib/constants/keys";
import { NOTE_TEMPLATES } from "../../../lib/notes/note-templates";
import { markdownToDoc } from "../../../lib/notes/note-markdown";

export type NoteCommandId =
    | "undo" | "redo" | "bold" | "italic" | "strike" | "code" | "clear-formatting"
    | "paragraph" | "heading" | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5" | "heading-6"
    | "bullet-list" | "numbered-list" | "checklist" | "quote" | "divider" | "code-block" | "link" | "table" | "indent" | "outdent"
    | "table-add-row" | "table-add-column" | "table-delete-row" | "table-delete-column" | "table-delete"
    | "find" | "copy-markdown" | "download-markdown" | "edit-markdown" | "outline" | "convert-subtasks"
    | `template:${string}`;

export interface NoteCommand {
    id: NoteCommandId;
    label: string;
    description: string;
    icon: LucideIcon;
    /** Display only; the real binding lives in the editor's key handling. */
    shortcut?: string;
    /** Extra words the slash menu matches (so "/template" finds the templates). */
    keywords?: string[];
    /** The editor command, when it is one. Menu-level actions (find, export) are handled by the room. */
    run?: (editor: Editor) => boolean;
    /** Marks/blocks that show as pressed. */
    isActive?: (editor: Editor) => boolean;
    canRun?: (editor: Editor) => boolean;
}

const mod = (keys: string) => `${MOD_KEY === "⌘" ? "⌘" : "Ctrl+"}${keys}`;
const chain = (e: Editor) => e.chain().focus();
const inList = (e: Editor) => e.isActive("listItem") || e.isActive("taskItem");
const listType = (e: Editor) => (e.isActive("taskItem") ? "taskItem" : "listItem");

const mk = (c: NoteCommand): NoteCommand => c;

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, icon: LucideIcon): NoteCommand =>
    mk({
        id: `heading-${level}`,
        label: `Heading ${level}`,
        description: `A level ${level} section heading`,
        icon,
        run: (e) => chain(e).toggleHeading({ level }).run(),
        isActive: (e) => e.isActive("heading", { level }),
    });

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
    checklist: ListTodo, bullets: List, meeting: CalendarDays, brainstorm: Lightbulb, decision: CheckCircle2, "next-steps": FileText,
};

export const TEMPLATE_COMMANDS: NoteCommand[] = NOTE_TEMPLATES.map((t) =>
    mk({
        id: `template:${t.id}`,
        label: t.label,
        description: t.description,
        icon: TEMPLATE_ICONS[t.id] ?? FileText,
        keywords: ["template"],
        // Read at insertion time: the meeting template stamps today's date in the user's zone.
        run: (e) => chain(e).insertContent(markdownToDoc(NOTE_TEMPLATES.find((x) => x.id === t.id)!.body).content ?? []).run(),
    }),
);

export const NOTE_COMMANDS: NoteCommand[] = [
    mk({ id: "undo", label: "Undo", description: "Undo the last change", icon: Undo2, shortcut: mod("Z"), run: (e) => e.chain().focus().undo().run(), canRun: (e) => e.can().undo() }),
    mk({ id: "redo", label: "Redo", description: "Redo the change", icon: Redo2, shortcut: MOD_KEY === "⌘" ? "⇧⌘Z" : "Ctrl+Y", run: (e) => e.chain().focus().redo().run(), canRun: (e) => e.can().redo() }),
    mk({ id: "bold", label: "Bold", description: "Make text bold", icon: Bold, shortcut: mod("B"), run: (e) => chain(e).toggleBold().run(), isActive: (e) => e.isActive("bold") }),
    mk({ id: "italic", label: "Italic", description: "Make text italic", icon: Italic, shortcut: mod("I"), run: (e) => chain(e).toggleItalic().run(), isActive: (e) => e.isActive("italic") }),
    mk({ id: "strike", label: "Strikethrough", description: "Cross text out", icon: Strikethrough, run: (e) => chain(e).toggleStrike().run(), isActive: (e) => e.isActive("strike") }),
    mk({ id: "code", label: "Code", description: "Format as inline code", icon: Code2, run: (e) => chain(e).toggleCode().run(), isActive: (e) => e.isActive("code") }),
    mk({ id: "clear-formatting", label: "Clear formatting", description: "Remove bold, italic and other marks", icon: RemoveFormatting, run: (e) => chain(e).unsetAllMarks().run() }),
    mk({ id: "paragraph", label: "Normal text", description: "Plain paragraph", icon: Pilcrow, run: (e) => chain(e).setParagraph().run(), isActive: (e) => e.isActive("paragraph") }),
    // The slash id "heading" predates the room: it stays, as a section heading.
    mk({ ...heading(2, Heading2), id: "heading", label: "Heading", description: "Add a section heading" }),
    heading(1, Heading1),
    heading(2, Heading2),
    heading(3, Heading3),
    heading(4, Heading3),
    heading(5, Heading3),
    heading(6, Heading3),
    mk({ id: "bullet-list", label: "Bullet list", description: "Start a bullet list", icon: List, run: (e) => chain(e).toggleBulletList().run(), isActive: (e) => e.isActive("bulletList") }),
    mk({ id: "numbered-list", label: "Numbered list", description: "Start a numbered list", icon: ListOrdered, run: (e) => chain(e).toggleOrderedList().run(), isActive: (e) => e.isActive("orderedList") }),
    mk({ id: "checklist", label: "Checklist", description: "Add a checklist", icon: ListTodo, run: (e) => chain(e).toggleTaskList().run(), isActive: (e) => e.isActive("taskList") }),
    mk({ id: "quote", label: "Quote", description: "Insert a blockquote", icon: Quote, run: (e) => chain(e).toggleBlockquote().run(), isActive: (e) => e.isActive("blockquote") }),
    mk({ id: "divider", label: "Divider", description: "Add a horizontal line", icon: Minus, run: (e) => chain(e).setHorizontalRule().run() }),
    mk({ id: "code-block", label: "Code block", description: "Keep code exactly as typed", icon: SquareCode, run: (e) => chain(e).toggleCodeBlock().run(), isActive: (e) => e.isActive("codeBlock") }),
    mk({ id: "link", label: "Link", description: "Link text to a page", icon: Link2, shortcut: mod("K"), isActive: (e) => e.isActive("link") }),
    mk({ id: "table", label: "Table", description: "Insert a simple table", icon: Table2, keywords: ["grid"], run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }),
    mk({ id: "indent", label: "Indent", description: "Nest the list item", icon: IndentIncrease, run: (e) => chain(e).sinkListItem(listType(e)).run(), canRun: inList }),
    mk({ id: "outdent", label: "Outdent", description: "Move the list item out", icon: IndentDecrease, run: (e) => chain(e).liftListItem(listType(e)).run(), canRun: inList }),
    mk({ id: "table-add-row", label: "Add row", description: "Add a row below", icon: Table2, run: (e) => chain(e).addRowAfter().run(), canRun: (e) => e.isActive("table") }),
    mk({ id: "table-add-column", label: "Add column", description: "Add a column after", icon: Table2, run: (e) => chain(e).addColumnAfter().run(), canRun: (e) => e.isActive("table") }),
    mk({ id: "table-delete-row", label: "Delete row", description: "Remove this row", icon: Table2, run: (e) => chain(e).deleteRow().run(), canRun: (e) => e.isActive("table") }),
    mk({ id: "table-delete-column", label: "Delete column", description: "Remove this column", icon: Table2, run: (e) => chain(e).deleteColumn().run(), canRun: (e) => e.isActive("table") }),
    mk({ id: "table-delete", label: "Delete table", description: "Remove the whole table", icon: Table2, run: (e) => chain(e).deleteTable().run(), canRun: (e) => e.isActive("table") }),
    // Handled by the room (they need more than the editor):
    mk({ id: "find", label: "Find and replace", description: "Search this note", icon: Search, shortcut: mod("F") }),
    mk({ id: "copy-markdown", label: "Copy Markdown", description: "Copy the note as Markdown", icon: ClipboardCopy }),
    mk({ id: "download-markdown", label: "Download .md", description: "Save the note as a file", icon: Download }),
    mk({ id: "edit-markdown", label: "Edit Markdown", description: "Edit the note's source text", icon: FileCode }),
    mk({ id: "outline", label: "Outline", description: "Jump between headings", icon: ListChecks }),
    mk({ id: "convert-subtasks", label: "Subtasks from lines", description: "Turn list lines into subtasks", icon: ListChecks }),
    ...TEMPLATE_COMMANDS,
];

const byId = new Map(NOTE_COMMANDS.map((c) => [c.id, c]));
export const getNoteCommand = (id: NoteCommandId) => byId.get(id)!;

/** Run an editor-level command; `false` when the id is a room-level action. */
export function runNoteCommand(editor: Editor, id: NoteCommandId): boolean {
    const command = byId.get(id);
    return command?.run ? command.run(editor) : false;
}

/** What the slash menu offers: the original six block commands, then the templates. */
export const SLASH_COMMANDS: NoteCommand[] = [
    ...(["heading", "bullet-list", "numbered-list", "checklist", "quote", "divider"] as const).map(getNoteCommand),
    getNoteCommand("code-block"),
    getNoteCommand("table"),
    ...TEMPLATE_COMMANDS,
];

export function filterSlashCommands(query: string): NoteCommand[] {
    const q = query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.keywords?.some((k) => k.includes(q)));
}

export type MarkState = "on" | "off" | "mixed";

/** Whether a mark covers all, part or none of the selection (the toolbar shows mixed selections). */
export function markState(editor: Editor, name: string): MarkState {
    const { from, to, empty } = editor.state.selection;
    if (empty) return editor.isActive(name) ? "on" : "off";
    let withMark = 0;
    let without = 0;
    editor.state.doc.nodesBetween(from, to, (node) => {
        if (!node.isText) return;
        if (node.marks.some((m) => m.type.name === name)) withMark++;
        else without++;
    });
    return withMark === 0 ? "off" : without === 0 ? "on" : "mixed";
}
