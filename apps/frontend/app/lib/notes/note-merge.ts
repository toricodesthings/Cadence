/**
 * Conservative three-way merge of note text (base = what both edits started from).
 * Accepts only edits to separate places; anything that touches the same lines is a
 * conflict for the user to settle, never a guessed result.
 */
import { diffArrays } from "diff";

interface Hunk {
    /** Base lines [start, end) replaced by `lines`. */
    start: number;
    end: number;
    lines: string[];
}

/** Past this many changed lines, two edits are a conflict to review, not a diff to compute. */
const MAX_EDIT_LINES = 1000;

function hunks(base: string[], other: string[]): Hunk[] | null {
    const parts = diffArrays(base, other, { maxEditLength: MAX_EDIT_LINES });
    if (!parts) return null;
    const out: Hunk[] = [];
    let at = 0;
    let open: Hunk | null = null;
    for (const part of parts) {
        if (!part.added && !part.removed) {
            if (open) out.push(open);
            open = null;
            at += part.count;
            continue;
        }
        open ??= { start: at, end: at, lines: [] };
        if (part.added) open.lines.push(...part.value);
        else open.end = at += part.count;
    }
    if (open) out.push(open);
    return out;
}

const sameHunk = (x: Hunk, y: Hunk) => x.start === y.start && x.end === y.end && x.lines.join("\n") === y.lines.join("\n");
const touches = (x: Hunk, y: Hunk) => x.start <= y.end && y.start <= x.end;
const fences = (text: string) => (text.match(/^\s*(```|~~~)/gm) ?? []).length % 2;

export type Merge = { ok: true; body: string } | { ok: false };

export function mergeNotes(base: string, local: string, remote: string): Merge {
    if (local === remote) return { ok: true, body: local };
    if (local === base) return { ok: true, body: remote };
    if (remote === base) return { ok: true, body: local };

    const baseLines = base.split("\n");
    const mine = hunks(baseLines, local.split("\n"));
    const theirs = hunks(baseLines, remote.split("\n"));
    if (!mine || !theirs) return { ok: false };
    const all: Hunk[] = [];
    for (const h of mine) {
        const twin = theirs.find((t) => touches(h, t));
        if (twin && !sameHunk(h, twin)) return { ok: false };
        if (!twin) all.push(h);
    }
    all.push(...theirs);
    all.sort((x, y) => x.start - y.start || x.end - y.end);

    const out: string[] = [];
    let at = 0;
    for (const h of all) {
        out.push(...baseLines.slice(at, h.start), ...h.lines);
        at = h.end;
    }
    out.push(...baseLines.slice(at));
    const body = out.join("\n");

    // Both sides were valid on their own; the result must be too.
    if (fences(body) !== fences(local) || fences(local) !== fences(remote)) return { ok: false };
    return { ok: true, body };
}

export type Reconciled =
    /** Server already holds this text: acknowledge it, write nothing. */
    | { kind: "same" }
    /** Text from both sides, combined; save it against the server's revision. */
    | { kind: "merged"; body: string }
    /** Overlapping edits: nothing is guessed, both versions stay recoverable. */
    | { kind: "conflict" };

/** `base` is the text the local edit started from; `undefined` when unknown (older queued saves). */
export function reconcileNote(base: string | undefined, local: string, remote: string): Reconciled {
    if (local === remote) return { kind: "same" };
    if (base === undefined) return { kind: "conflict" };
    const merged = mergeNotes(base, local, remote);
    return merged.ok ? { kind: "merged", body: merged.body } : { kind: "conflict" };
}
