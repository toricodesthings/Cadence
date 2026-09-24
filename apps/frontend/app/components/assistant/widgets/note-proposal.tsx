/**
 * Note changes proposed by the assistant. The note the user sees is the task's
 * dedicated note (falling back to the task's legacy `content`), so that is what
 * the card diffs against and writes to, guarded by the version the model read.
 */
import { useTaskNoteQuery, useWriteTaskNote } from "../../../hooks/tasks/use-task-note-api";
import { ApiErrorResponse } from "../../../types/api";
import { useTaskLookup } from "./card-lookups";
import { ProposalError } from "./use-proposal-resolver";

/** The longest note the assistant may rewrite whole: it only ever reads this much. */
export const NOTE_REWRITE_LIMIT = 1_000;

export interface NoteProposal {
    /** Replaces the whole note. */
    note?: string;
    /** Added at the end of the note. */
    appendNote?: string;
    /** The version the model read (0 = no note). */
    noteVersion?: number;
}

/** The note after the proposal, or undefined when it doesn't touch the note. */
export function nextNoteText(current: string, proposal: NoteProposal): string | undefined {
    if (proposal.note !== undefined) return proposal.note;
    if (proposal.appendNote) return current ? `${current.trimEnd()}\n${proposal.appendNote}` : proposal.appendNote;
    return undefined;
}

/** Changed lines only: what goes and what comes. Unchanged lines aren't shown. */
export function noteLineDiff(current: string, next: string) {
    const lines = (text: string) => text.split("\n").filter((line) => line.trim());
    const before = lines(current);
    const after = lines(next);
    return [
        ...before.filter((line) => !after.includes(line)).map((text) => ({ text, removed: true })),
        ...after.filter((line) => !before.includes(line)).map((text) => ({ text, removed: false })),
    ];
}

/**
 * The current note for `taskId`, what the proposal would make of it, and a guarded
 * writer. `removesText` is true while the note is still loading, so Auto never
 * applies a rewrite it hasn't checked.
 */
export function useNoteProposal(taskId: string | undefined, proposal: NoteProposal) {
    const touchesNote = proposal.note !== undefined || !!proposal.appendNote;
    const noteQuery = useTaskNoteQuery(touchesNote && taskId ? taskId : null);
    const lookupTask = useTaskLookup();
    const writeNote = useWriteTaskNote();

    const current = noteQuery.data?.body ?? (taskId ? lookupTask(taskId)?.content : null) ?? "";
    const next = nextNoteText(current, proposal);
    const diff = next === undefined ? [] : noteLineDiff(current, next);
    const loading = touchesNote && !!taskId && noteQuery.isLoading;
    const removesText = loading || diff.some((line) => line.removed);

    /** Write the note; for a task created just now pass its id (its note is empty, version 0). */
    const write = async (createdTaskId?: string) => {
        if (!touchesNote) return;
        const target = createdTaskId ?? taskId;
        if (!target) return;
        if (createdTaskId) {
            await writeNote(target, nextNoteText("", proposal) ?? "", 0);
            return;
        }
        // Check against the note as it is now, not as it was when the card rendered.
        const fresh = (await noteQuery.refetch()).data;
        const body = fresh?.body ?? lookupTask(target)?.content ?? "";
        if (proposal.note !== undefined && body.length > NOTE_REWRITE_LIMIT) {
            throw new ProposalError("That note’s too long for me to rewrite, but I can add to it.");
        }
        try {
            await writeNote(target, nextNoteText(body, proposal) ?? body, proposal.noteVersion ?? fresh?.version ?? 0);
        } catch (err) {
            if (err instanceof ApiErrorResponse && err.status === 409) {
                throw new ProposalError("Your note changed. Want me to look again?");
            }
            throw err;
        }
    };

    return { touchesNote, current, next, diff, removesText, write };
}

/** The before → after lines of a note change: removed lines struck through. */
export function NoteDiff({ diff }: { diff: { text: string; removed: boolean }[] }) {
    if (!diff.length) return null;
    return (
        <div className="space-y-0.5 rounded-lg bg-twilight-deep/40 px-2.5 py-1.5 text-[11px]" aria-label="Note changes">
            {diff.map((line, i) => (
                <p
                    key={i}
                    className={line.removed ? "text-twilight-text-muted line-through" : "text-twilight-text-soft"}
                    aria-label={`${line.removed ? "Remove" : "Add"}: ${line.text}`}
                >
                    {line.removed ? "− " : "+ "}
                    {line.text}
                </p>
            ))}
        </div>
    );
}
