/**
 * Conservative three-way merge of note text (base = what both edits started from).
 * Accepts only edits to separate places; anything that touches the same lines is a
 * conflict for the user to settle, never a guessed result.
 */

interface Hunk {
    /** Base lines [start, end) replaced by `lines`. */
    start: number;
    end: number;
    lines: string[];
}

function hunks(base: string[], other: string[]): Hunk[] {
    let head = 0;
    while (head < base.length && head < other.length && base[head] === other[head]) head++;
    let tail = 0;
    while (tail < base.length - head && tail < other.length - head && base[base.length - 1 - tail] === other[other.length - 1 - tail]) tail++;
    const a = base.slice(head, base.length - tail);
    const b = other.slice(head, other.length - tail);

    // Longest common subsequence of the differing middle.
    const w = b.length + 1;
    const lcs = new Uint32Array((a.length + 1) * w);
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
        }
    }
    const out: Hunk[] = [];
    let i = 0;
    let j = 0;
    let open: Hunk | null = null;
    const close = () => {
        if (open) out.push(open);
        open = null;
    };
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            close();
            i++;
            j++;
        } else if (j < b.length && (i === a.length || lcs[i * w + j + 1] >= lcs[(i + 1) * w + j])) {
            open ??= { start: head + i, end: head + i, lines: [] };
            open.lines.push(b[j++]);
        } else {
            open ??= { start: head + i, end: head + i, lines: [] };
            open.end = head + ++i;
        }
    }
    close();
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
