/**
 * What to do when the server's note moved on while this one had unsaved text.
 * Pure: the caller fetched `remote` and decides how to apply the answer.
 */
import { mergeNotes } from "./note-merge";

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
