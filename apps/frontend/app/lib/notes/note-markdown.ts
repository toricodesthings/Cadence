import { Editor, type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";

export function noteExtensions(placeholder?: string, opts?: { collaborative?: boolean }): Extensions {
    return [
        StarterKit.configure({
            underline: false,
            link: { openOnClick: false, autolink: false },
            ...(opts?.collaborative ? { undoRedo: false } : {}),
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table,
        TableRow,
        TableHeader,
        TableCell,
        Image.configure({ inline: true }),
        Markdown,
        ...(placeholder ? [Placeholder.configure({ placeholder, showOnlyCurrent: false })] : []),
    ];
}

let converter: Editor | null = null;
function conv(): Editor {
    return (converter ??= new Editor({ extensions: noteExtensions(), content: "" }));
}

const EMPTY_TASK = /^\[( |x)\]$/i;
const isEmptyTaskItem = (item: JSONContent) => {
    const text =
        item.content?.length === 1 && item.content[0].type === "paragraph"
            ? item.content[0].content?.map((n) => n.text ?? "").join("")
            : undefined;
    return text !== undefined && EMPTY_TASK.test(text);
};

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
    return doc.content?.length ? doc : { type: "doc", content: [{ type: "paragraph" }] };
}

export function docToMarkdown(doc: JSONContent): string {
    return conv()
        .markdown!.serialize(doc)
        .replace(/^\n+|\n+$/g, "");
}

export function docText(doc: JSONContent): string {
    const parts: string[] = [];
    const walk = (n: JSONContent) => {
        if (n.text) parts.push(n.text);
        n.content?.forEach(walk);
        if (n.type && n.type !== "text" && n.content === undefined) parts.push(" ");
        if (
            n.type &&
            ["paragraph", "heading", "listItem", "taskItem", "codeBlock", "tableCell", "tableHeader"].includes(n.type)
        )
            parts.push("\n");
    };
    walk(doc);
    return parts.join("");
}

const signature = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, "");

export function isFaithful(markdown: string, serialized = docToMarkdown(markdownToDoc(markdown))): boolean {
    return signature(markdown) === signature(serialized);
}
