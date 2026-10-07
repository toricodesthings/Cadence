import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { markState, type MarkState } from "./note-commands";

export interface ToolbarState {
    bold: MarkState;
    italic: MarkState;
    strike: MarkState;
    code: MarkState;
    link: boolean;
    block: "paragraph" | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5" | "heading-6" | "code-block" | "quote";
    bullet: boolean;
    ordered: boolean;
    task: boolean;
    inList: boolean;
    canUndo: boolean;
    canRedo: boolean;
}

const IDLE: ToolbarState = {
    bold: "off", italic: "off", strike: "off", code: "off", link: false, block: "paragraph",
    bullet: false, ordered: false, task: false, inList: false, canUndo: false, canRedo: false,
};

/** Toolbar state from the editor, recomputed per transaction but re-rendering only when a value changed. */
export function useNoteToolbarState(editor: Editor | null): ToolbarState {
    return useEditorState({
        editor,
        selector: ({ editor: e }): ToolbarState => {
            if (!e) return IDLE;
            const level = [1, 2, 3, 4, 5, 6].find((l) => e.isActive("heading", { level: l }));
            return {
                bold: markState(e, "bold"),
                italic: markState(e, "italic"),
                strike: markState(e, "strike"),
                code: markState(e, "code"),
                link: e.isActive("link"),
                block: level ? (`heading-${level}` as ToolbarState["block"]) : e.isActive("codeBlock") ? "code-block" : e.isActive("blockquote") ? "quote" : "paragraph",
                bullet: e.isActive("bulletList"),
                ordered: e.isActive("orderedList"),
                task: e.isActive("taskList"),
                inList: e.isActive("listItem") || e.isActive("taskItem"),
                canUndo: e.can().undo(),
                canRedo: e.can().redo(),
            };
        },
        equalityFn: (a, b) => !!b && (Object.keys(a) as (keyof ToolbarState)[]).every((k) => a[k] === b[k]),
    }) ?? IDLE;
}

export const BLOCK_LABEL: Record<ToolbarState["block"], string> = {
    paragraph: "Normal text",
    "heading-1": "Heading 1",
    "heading-2": "Heading 2",
    "heading-3": "Heading 3",
    "heading-4": "Heading 4",
    "heading-5": "Heading 5",
    "heading-6": "Heading 6",
    "code-block": "Code block",
    quote: "Quote",
};
