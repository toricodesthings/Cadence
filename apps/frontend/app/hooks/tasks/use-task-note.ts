import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTask } from "./use-tasks";
import { getNoteOwnerTaskId } from "../../lib/notes/recurring-note-scope";
import { useTaskNoteQuery } from "./use-task-note-api";
import { useAuthState } from "../auth/use-auth-state";
import { useOnlineStatus } from "../core/use-online-status";
import { acquireNoteSession, releaseNoteSession } from "../../lib/notes/note-registry";
import { onNoteSaved } from "../../lib/notes/note-channel";
import { queryKeys } from "../../lib/api/query-keys";
import { noteStatus, type NoteSession } from "../../lib/notes/note-session";

/** The shared session for the owner's note, held while `ready` (which implies both ids); never the previous owner's after a switch. */
function useNoteSession(ready: boolean, userId: string | null, ownerId: string | null, legacy: React.RefObject<string>) {
    const queryClient = useQueryClient();
    const [held, setHeld] = useState<NoteSession | null>(null);
    useEffect(() => {
        if (!ready || !userId || !ownerId) return setHeld(null);
        const acquired = acquireNoteSession(queryClient, userId, ownerId, () => legacy.current);
        setHeld(acquired);
        void acquired.load();
        return () => releaseNoteSession(userId, ownerId);
    }, [ready, queryClient, userId, ownerId]);
    // Between a task/account switch and the effect above, never hand out the previous owner's session.
    return held && held.owner === ownerId && held.userId === userId ? held : null;
}

/** Server data from elsewhere: poll/focus/reconnect, other tabs' announcements, and the online state. */
function useRemoteNote(session: NoteSession | null, userId: string | null, ownerId: string | null) {
    const queryClient = useQueryClient();
    const online = useOnlineStatus();
    const { data: remote } = useTaskNoteQuery(ownerId ?? null, { live: true });
    useEffect(() => {
        if (session && remote) session.receiveRemote(remote);
    }, [session, remote]);
    useEffect(() => {
        if (!userId || !ownerId) return;
        return onNoteSaved(userId, (m) => {
            if (m.owner === ownerId) void queryClient.invalidateQueries({ queryKey: queryKeys.notes.detail(ownerId) });
        });
    }, [queryClient, userId, ownerId]);
    useEffect(() => session?.setOnline(online), [session, online]);
}

/**
 * The task's note as one shared session: the task panel and the writing room read the
 * same text, status and save stream. Resolves the canonical owner (the series for a
 * recurring task) and the account once, so nothing leaks across tasks or accounts.
 */
export function useTaskNote(taskId: string | null) {
    const task = useTask(taskId) ?? null;
    const ownerId = task ? getNoteOwnerTaskId(task) : taskId;
    const ownerTask = useTask(ownerId !== taskId ? ownerId : null);
    const noteOwnerTask = ownerTask ?? task;
    const { session: auth } = useAuthState();
    const userId = auth?.user.id ?? null;
    const legacy = useRef("");
    legacy.current = noteOwnerTask?.content ?? "";

    // Wait for the owner before editing: an occurrence must never open its own empty note.
    const session = useNoteSession(!!task && !!ownerId && !!userId, userId, ownerId, legacy);

    const state = useSyncExternalStore(
        (cb) => session?.subscribe(cb) ?? (() => undefined),
        () => session?.getSnapshot() ?? null,
        () => null,
    );
    useRemoteNote(session, userId, ownerId);

    return {
        task,
        noteOwnerTask,
        session,
        state,
        status: state ? noteStatus(state) : "loading",
        isLoading: !session || !state?.loaded,
        loadFailed: state?.loadFailed ?? false,
    };
}
