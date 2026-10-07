import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { extractActionableLines } from "../../lib/notes/markdown-transforms";
import { useCreateSubtask, useDeleteSubtask } from "./use-subtasks";

/** Completed conversions this session, by task and exact lines: the same batch isn't silently made twice. */
const converted = new Map<string, string[]>();
/** Ids chosen for an unfinished attempt, so a retry repeats the same subtasks instead of adding more. */
const attempts = new Map<string, string[]>();

const signatureOf = (taskId: string, lines: string[]) => `${taskId}\n${lines.join("\n")}`;

/**
 * Turn a note's list lines into subtasks of `taskId`: explicit, previewed by the caller, one submission at a
 * time, retry-safe (stable ids), and undoable. Nothing here runs from typing or ticking a note checkbox.
 */
export function useNoteSubtasks(taskId: string, body: string) {
    const create = useCreateSubtask(taskId);
    const remove = useDeleteSubtask(taskId);
    const lines = useMemo(() => extractActionableLines(body), [body]);
    const signature = signatureOf(taskId, lines);
    const [submitting, setSubmitting] = useState(false);
    const [, bump] = useState(0);
    const done = converted.get(signature);

    const undo = useCallback((ids: string[]) => {
        for (const id of ids) remove.mutate(id);
        converted.delete(signature);
        bump((n) => n + 1);
    }, [remove, signature]);

    const convert = useCallback(async () => {
        if (submitting || converted.has(signature) || lines.length === 0) return;
        setSubmitting(true);
        const ids = attempts.get(signature) ?? lines.map(() => crypto.randomUUID());
        attempts.set(signature, ids);
        try {
            const base = Date.now();
            await Promise.all(lines.map((title, i) => create.mutateAsync({ title, orderIndex: base + i, id: ids[i] } as { title: string; orderIndex: number })));
            converted.set(signature, ids);
            attempts.delete(signature);
            toast.success(`Added ${lines.length} subtask${lines.length === 1 ? "" : "s"}`, { action: { label: "Undo", onClick: () => undo(ids) } });
        } catch {
            // The mutation already told the user; ids stay so Retry won't duplicate.
        } finally {
            setSubmitting(false);
            bump((n) => n + 1);
        }
    }, [create, lines, signature, submitting, undo]);

    return { lines, submitting, done: !!done, convert, undo: () => done && undo(done) };
}
