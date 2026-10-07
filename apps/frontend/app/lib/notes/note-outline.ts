/**
 * Note outline and counts, derived from the editor document (not from Markdown line estimates).
 */
import type { Node as PMNode } from "@tiptap/pm/model";

export interface NoteHeading {
    /** Stable while the text is: level + label + which repeat of it this is. */
    id: string;
    level: number;
    text: string;
    pos: number;
}

export function extractNoteOutline(doc: PMNode): NoteHeading[] {
    const seen = new Map<string, number>();
    const out: NoteHeading[] = [];
    doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
            const text = node.textContent.trim();
            if (!text) return false;
            const base = `${node.attrs.level}:${text}`;
            const n = seen.get(base) ?? 0;
            seen.set(base, n + 1);
            out.push({ id: `${base}#${n}`, level: node.attrs.level as number, text, pos });
            return false;
        }
    });
    return out;
}

/** The heading a search result names: the first with that exact text (deterministic when labels repeat). */
export function findHeading(outline: NoteHeading[], label: string): NoteHeading | undefined {
    const wanted = label.trim();
    return outline.find((h) => h.text === wanted);
}

/** The heading the caret is under, for the outline's quiet current marker. */
export function currentHeadingId(outline: NoteHeading[], caret: number): string | null {
    let id: string | null = null;
    for (const h of outline) {
        if (h.pos > caret) break;
        id = h.id;
    }
    return id;
}

/** Words in visible text (no syntax or link destinations). */
export function countWords(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}
