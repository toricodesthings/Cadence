import type { Node as PMNode } from "@tiptap/pm/model";

export interface NoteHeading {
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

export function findHeading(outline: NoteHeading[], label: string): NoteHeading | undefined {
    const wanted = label.trim();
    return outline.find((h) => h.text === wanted);
}

export function currentHeadingId(outline: NoteHeading[], caret: number): string | null {
    let id: string | null = null;
    for (const h of outline) {
        if (h.pos > caret) break;
        id = h.id;
    }
    return id;
}
