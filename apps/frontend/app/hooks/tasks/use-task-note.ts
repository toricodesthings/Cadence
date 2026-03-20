import { useState, useEffect, useRef, useCallback } from "react";
import { useTasks } from "../tasks";
import { useDebouncedCallback } from "../core/use-debounced-callback";
import type { SaveStatus } from "../../components/tasks/TaskNoteSaveStatus";
import { getNoteOwnerTaskId } from "../../lib/notes/recurring-note-scope";
import { useTaskNoteQuery, useUpsertTaskNote } from "./use-task-note-api";

/**
 * All-in-one hook for task note editing. Handles:
 * - Resolving note owner (series-scoped for recurring tasks)
 * - Uses dedicated task_notes API (lazy loaded, separate from tasks.content)
 * - Local draft state
 * - Debounced save (800ms)
 * - Save status tracking
 */
export function useTaskNote(taskId: string | null) {
    const { data: activeTasks } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks } = useTasks({ state: "WAITING" });
    const { data: archiveTasks } = useTasks({ state: "ARCHIVED" });
    const { data: doneTasks } = useTasks({ state: "COMPLETE" });

    // Find the task across all caches
    const allTasks = [
        ...(activeTasks ?? []),
        ...(waitingTasks ?? []),
        ...(archiveTasks ?? []),
        ...(doneTasks ?? []),
    ];
    const task = allTasks.find((t) => t.id === taskId) ?? null;

    // Resolve note owner for recurring tasks
    const noteOwnerId = task ? getNoteOwnerTaskId(task) : taskId;
    const noteOwnerTask =
        noteOwnerId !== taskId
            ? allTasks.find((t) => t.id === noteOwnerId) ?? task
            : task;

    // Lazy-load dedicated note for the owner task
    const { data: noteData, isLoading: noteLoading } = useTaskNoteQuery(noteOwnerId);
    const upsertNote = useUpsertTaskNote(noteOwnerId ?? "");

    // Determine initial content: prefer dedicated note body, fall back to task.content
    const serverBody = noteData?.body ?? noteOwnerTask?.content ?? "";

    const [draft, setDraft] = useState(serverBody);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const lastSyncedRef = useRef<string>(serverBody);
    /** Prevents background refetch data from overwriting in-progress edits */
    const isDirtyRef = useRef(false);

    // Sync draft when server data changes — only if user hasn't made unsaved edits
    useEffect(() => {
        if (isDirtyRef.current) return;
        if (serverBody !== lastSyncedRef.current) {
            setDraft(serverBody);
            lastSyncedRef.current = serverBody;
        }
    }, [serverBody]);

    // Reset on task switch
    useEffect(() => {
        isDirtyRef.current = false;
        setSaveStatus("idle");
    }, [taskId]);

    const debouncedSave = useDebouncedCallback((body: string) => {
        if (!noteOwnerId) return;
        setSaveStatus("saving");
        upsertNote.mutate(
            { body, expectedUpdatedAt: noteData?.updatedAt },
            {
                onSuccess: () => {
                    isDirtyRef.current = false;
                    lastSyncedRef.current = body;
                    setSaveStatus("saved");
                    clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
                },
                onError: () => setSaveStatus("error"),
            },
        );
    }, 800);

    const onChange = useCallback(
        (value: string) => {
            isDirtyRef.current = true;
            setDraft(value);
            debouncedSave(value);
        },
        [debouncedSave],
    );

    return {
        task,
        noteOwnerTask,
        draft,
        onChange,
        saveStatus,
        isLoading: (!task && taskId !== null) || noteLoading,
        noteData,
    };
}
