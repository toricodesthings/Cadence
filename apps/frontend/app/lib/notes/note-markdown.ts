/**
 * Markdown adapter for the note editor: the bounded Tiptap schema plus the two
 * conversions between stored Markdown and the editor document. Stored text stays
 * Markdown; the editor document is ephemeral.
 */
import { Editor, type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";

export function noteExtensions(placeholder?: string): Extensions {
    return [
        // Underline has no Markdown form, so it isn't offered.
        StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: false } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table,
        TableRow,
        TableHeader,
        TableCell,
        // Existing images render and survive; there is deliberately no upload control.
        Image.configure({ inline: true }),
        Markdown,
        ...(placeholder ? [Placeholder.configure({ placeholder, showOnlyCurrent: false })] : []),
    ];
}

/** A throwaway editor used only to convert between Markdown and documents (no DOM mount). */
let converter: Editor | null = null;
function conv(): Editor {
    return (converter ??= new Editor({ extensions: noteExtensions(), content: "" }));
}

const EMPTY_TASK = /^\[( |x)\]$/i;
const isEmptyTaskItem = (item: JSONContent) => {
    const text = item.content?.length === 1 && item.content[0].type === "paragraph" ? item.content[0].content?.map((n) => n.text ?? "").join("") : undefined;
    return text !== undefined && EMPTY_TASK.test(text);
};

/** `- [ ]` with nothing after it isn't a task to the parser; make lists made only of those real checklists. */
function fixEmptyTasks(node: JSONContent): JSONContent {
    const content = node.content?.map(fixEmptyTasks);
    if (node.type === "bulletList" && content?.length && content.every(isEmptyTaskItem)) {
        return {
            type: "taskList",
            content: content.map((item) => ({
                type: "taskItem",
                attrs: { checked: item.content![0].content![0].text!.toLowerCase() === "[x]" },
                content: [{ type: "paragraph" }],
            })),
        };
    }
    return content ? { ...node, content } : node;
}

export function markdownToDoc(markdown: string): JSONContent {
    const doc = fixEmptyTasks(conv().markdown!.parse(markdown));
    // A document needs at least one block, or nothing renders (an empty note).
    return doc.content?.length ? doc : { type: "doc", content: [{ type: "paragraph" }] };
}

export function docToMarkdown(doc: JSONContent): string {
    return conv().markdown!.serialize(doc).replace(/^\n+|\n+$/g, "");
}

/** Text content only (no syntax, no link destinations), for word counts. */
export function docText(doc: JSONContent): string {
    const parts: string[] = [];
    const walk = (n: JSONContent) => {
        if (n.text) parts.push(n.text);
        n.content?.forEach(walk);
        if (n.type && n.type !== "text" && n.content === undefined) parts.push(" ");
        if (n.type && ["paragraph", "heading", "listItem", "taskItem", "codeBlock", "tableCell", "tableHeader"].includes(n.type)) parts.push("\n");
    };
    walk(doc);
    return parts.join("");
}

/** Letters and digits only: what a conversion must never lose. */
const signature = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Whether the visual editor can carry this Markdown without dropping any of it.
 * Anything the schema doesn't know (HTML blocks, reference definitions, footnotes)
 * vanishes in conversion, which shows up as missing letters or digits. Such notes
 * open in Markdown source instead of risking silent loss on the next save.
 */
export function isFaithful(markdown: string, serialized = docToMarkdown(markdownToDoc(markdown))): boolean {
    return signature(markdown) === signature(serialized);
}
