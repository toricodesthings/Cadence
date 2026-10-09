import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Habit } from "@cadence/contracts/habit";
import type { Task } from "@cadence/contracts/task";
import { UtilitySheet } from "./UtilitySheet";
import { Button } from "../primitives/Button";
import { useMutationOutbox } from "../../lib/api/mutation-outbox";
import { describeChange } from "../../lib/api/describe-change";
import { queryKeys } from "../../lib/api/query-keys";
import type { WalEntry } from "../../lib/api/offline-wal";
import { replaceWalEntryOp, removeWalEntry } from "../../lib/api/offline-wal";
import { toRequests, replayWal } from "../../lib/api/mutation-executor";
import { keepRecoveryCopy, noteJournal } from "../../lib/notes/note-journal";
import { copyText } from "../tasks/note/note-export";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { fetchTaskNote } from "../../hooks/tasks/use-task-note-api";
import { NoteConflictSheet } from "../tasks/note/NoteConflictSheet";
import { toast } from "sonner";

/** A queued note edit that overlapped a newer version: both texts side by side, then keep either. */
function QueuedNoteConflict({ entry, title, onClose }: { entry: WalEntry; title?: string; onClose: () => void }) {
    const queryClient = useQueryClient();
    const userId = useAuthState().session?.user.id;
    const op = entry.op as Extract<WalEntry["op"], { type: "upsert_note" }>;
    const [latest, setLatest] = useState<{ body: string; version: number } | null>(null);
    useEffect(() => {
        void fetchTaskNote(op.taskId).then((n) => setLatest({ body: n?.body ?? "", version: n?.version ?? 0 })).catch(() => {
            toast.error("Couldn’t load the latest version");
            onClose();
        });
    }, [op.taskId, onClose]);
    // The version not picked stays on this device until discarded in the note.
    const setAside = (body: string) => (userId ? keepRecoveryCopy(noteJournal, userId, op.taskId, entry.id, body).catch(() => undefined) : undefined);
    if (!latest) return null;
    return (
        <NoteConflictSheet
            open
            onClose={onClose}
            mine={op.payload.body}
            latest={latest.body}
            taskTitle={title}
            onUseMine={async () => {
                await setAside(latest.body);
                const next = { ...op, payload: { ...op.payload, expectedVersion: latest.version, baseBody: latest.body, opId: crypto.randomUUID() } };
                await replaceWalEntryOp(entry.id, next, toRequests(next));
                onClose();
                void replayWal(queryClient);
            }}
            onUseLatest={async () => {
                await setAside(op.payload.body);
                await removeWalEntry(entry.id);
                await queryClient.invalidateQueries({ queryKey: queryKeys.notes.detail(op.taskId) });
                onClose();
                toast.message("Kept the latest version. Yours is set aside in the note.", { action: { label: "Copy mine", onClick: () => void copyText(op.payload.body) } });
            }}
        />
    );
}

/**
 * Changes that didn't sync, one by one: what it was, why, and Retry or Discard.
 * Nothing is dropped without the user choosing it (Discard asks once).
 */
export function SyncReviewSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const outbox = useMutationOutbox();
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState<string | null>(null);
    const [reviewing, setReviewing] = useState<WalEntry | null>(null);
    const stopReviewing = useCallback(() => setReviewing(null), []);
    const failed = outbox.failed;

    useEffect(() => {
        if (open && failed.length === 0) onClose();
    }, [failed.length, onClose, open]);

    const titleOf = (id: string) => {
        for (const key of [queryKeys.tasks.all, queryKeys.habits.all]) {
            for (const [, list] of queryClient.getQueriesData<(Task | Habit)[]>({ queryKey: key })) {
                const found = Array.isArray(list) ? list.find((item) => item.id === id) : undefined;
                if (found) return found.title;
            }
        }
        return undefined;
    };

    return (
        <UtilitySheet
            title="Changes that didn't sync"
            subtitle="They stay on this device until you retry or discard them."
            open={open}
            onClose={onClose}
            fit
            footer={
                <div className="flex justify-end px-4 py-3">
                    <Button size="md" onClick={outbox.retryFailed}>Retry all</Button>
                </div>
            }
        >
            <ul className="flex flex-col gap-2 py-2">
                {failed.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-twilight-surface/60 px-4 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] text-twilight-text">{describeChange(entry.op, titleOf)}</p>
                            {entry.error && <p className="mt-0.5 text-[13px] text-twilight-text-soft">{entry.error}</p>}
                        </div>
                        <div className="flex shrink-0 gap-2">
                            {entry.conflict
                                ? <Button size="sm" onClick={() => setReviewing(entry)}>Review</Button>
                                : <Button variant="ghost" size="sm" onClick={() => void outbox.retry(entry)}>Retry</Button>}
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                    if (confirming !== entry.id) return setConfirming(entry.id);
                                    setConfirming(null);
                                    void outbox.discard(entry);
                                }}
                            >
                                {confirming === entry.id ? "Discard for good" : "Discard"}
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
            {reviewing && <QueuedNoteConflict entry={reviewing} title={titleOf((reviewing.op as { taskId: string }).taskId)} onClose={stopReviewing} />}
        </UtilitySheet>
    );
}
