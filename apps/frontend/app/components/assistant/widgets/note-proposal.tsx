/**
 * Note changes the assistant wants to make. The note the user sees is the task's
 * dedicated note (falling back to the task's legacy `content`), so that is what
 * the card diffs against. The server writes it, guarded by the version the model read.
 */
import { useTaskNoteQuery } from "../../../hooks/tasks/use-task-note-api";
import { useTaskLookup } from "./card-lookups";

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

/** The current note for `taskId`, what the change would make of it, and the changed lines. */
export function useNoteProposal(taskId: string | undefined, proposal: NoteProposal) {
    const touchesNote = proposal.note !== undefined || !!proposal.appendNote;
    const noteQuery = useTaskNoteQuery(touchesNote && taskId ? taskId : null);
    const lookupTask = useTaskLookup();

    const current = noteQuery.data?.body ?? (taskId ? lookupTask(taskId)?.content : null) ?? "";
    const next = nextNoteText(current, proposal);
    const diff = next === undefined ? [] : noteLineDiff(current, next);
    return { touchesNote, current, next, diff };
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
