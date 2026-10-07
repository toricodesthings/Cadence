/** Small ProseMirror helpers shared by the note editor and its panels. */
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Make the editor's document equal `next` by replacing only the span that differs, as one
 * transaction marked remote: selection and scroll map through it, it never lands in undo
 * history, and the caller's update handler skips it (no save echo).
 */
export function applyRemoteDoc(editor: Editor, next: PMNode): boolean {
    const { state } = editor;
    const start = state.doc.content.findDiffStart(next.content);
    if (start === null) return false;
    const end = state.doc.content.findDiffEnd(next.content);
    if (!end) return false;
    let { a: endA, b: endB } = end;
    const overlap = start - Math.min(endA, endB);
    if (overlap > 0) {
        endA += overlap;
        endB += overlap;
    }
    const tr = state.tr
        .replace(start, endA, next.slice(start, endB))
        .setMeta("remote", true)
        .setMeta("addToHistory", false);
    editor.view.dispatch(tr);
    return true;
}

/** Document position in the editor under a pointer, or null. */
export function posAtPoint(editor: Editor, x: number, y: number): number | null {
    return editor.view.posAtCoords({ left: x, top: y })?.pos ?? null;
}

/** Screen rectangle of the caret (for popovers anchored to it), clamped to something Radix can position. */
export function caretRect(editor: Editor, pos = editor.state.selection.from): DOMRect {
    try {
        const c = editor.view.coordsAtPos(pos);
        return new DOMRect(c.left, c.top, 0, c.bottom - c.top);
    } catch {
        return new DOMRect(0, 0, 0, 0);
    }
}
