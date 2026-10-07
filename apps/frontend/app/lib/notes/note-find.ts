/**
 * Find and replace inside the note editor. Matches are decorations: they never touch the
 * document, the Markdown, or the save generation. Replace All is one transaction, so one undo.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface FindMatch {
    from: number;
    to: number;
}
interface FindState {
    query: string;
    matches: FindMatch[];
    current: number;
}

const key = new PluginKey<FindState>("noteFind");
const EMPTY: FindState = { query: "", matches: [], current: 0 };

/** Positions of every case-insensitive occurrence of `query` within single text blocks. */
export function findMatches(doc: PMNode, query: string): FindMatch[] {
    if (!query) return [];
    const needle = query.toLowerCase();
    const out: FindMatch[] = [];
    doc.descendants((node, pos) => {
        if (!node.isTextblock) return;
        let text = "";
        const at: number[] = [];
        node.forEach((child, offset) => {
            const start = pos + 1 + offset;
            if (child.isText) {
                for (let i = 0; i < child.text!.length; i++) at.push(start + i);
                text += child.text;
            } else {
                at.push(start);
                text += "￼";
            }
        });
        const hay = text.toLowerCase();
        for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
            out.push({ from: at[i], to: at[i + needle.length - 1] + 1 });
        }
        return false;
    });
    return out;
}

export const NoteFind = Extension.create({
    name: "noteFind",
    addProseMirrorPlugins() {
        return [
            new Plugin<FindState>({
                key,
                state: {
                    init: () => EMPTY,
                    apply(tr, prev) {
                        const meta = tr.getMeta(key) as Partial<FindState> | undefined;
                        const query = meta?.query ?? prev.query;
                        if (!meta && !tr.docChanged) return prev;
                        const matches = findMatches(tr.doc, query);
                        const current = meta?.current ?? Math.min(prev.current, Math.max(0, matches.length - 1));
                        return { query, matches, current };
                    },
                },
                props: {
                    decorations(state) {
                        const s = key.getState(state);
                        if (!s?.matches.length) return DecorationSet.empty;
                        return DecorationSet.create(
                            state.doc,
                            s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? "note-find-match note-find-current" : "note-find-match" })),
                        );
                    },
                },
            }),
        ];
    },
});

export const getFind = (editor: Editor): FindState => key.getState(editor.state) ?? EMPTY;

/** Updates the query (and optionally the current match); decorations only, no document change. */
export function setFind(editor: Editor, patch: { query?: string; current?: number }) {
    editor.view.dispatch(editor.state.tr.setMeta(key, patch).setMeta("addToHistory", false));
}

/** Move to the next/previous match (wrapping) and scroll it into view without taking focus. */
export function stepFind(editor: Editor, direction: 1 | -1) {
    const s = getFind(editor);
    if (!s.matches.length) return;
    const current = (s.current + direction + s.matches.length) % s.matches.length;
    setFind(editor, { current });
    const match = s.matches[current];
    const dom = editor.view.domAtPos(match.from).node;
    (dom instanceof Element ? dom : dom.parentElement)?.scrollIntoView({ block: "center", behavior: "auto" });
}

export function replaceCurrent(editor: Editor, text: string) {
    const s = getFind(editor);
    const match = s.matches[s.current];
    if (!match) return;
    editor.view.dispatch(editor.state.tr.insertText(text, match.from, match.to));
}

/** Every match at once, one undo step. Returns how many were replaced. */
export function replaceAll(editor: Editor, text: string): number {
    const { matches } = getFind(editor);
    if (!matches.length) return 0;
    const tr = editor.state.tr;
    for (const m of [...matches].reverse()) tr.insertText(text, m.from, m.to);
    editor.view.dispatch(tr);
    return matches.length;
}
