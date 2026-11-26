import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTask } from "./use-tasks";
import { getNoteOwnerTaskId } from "../../lib/notes/recurring-note-scope";
import { useTaskNoteQuery } from "./use-task-note-api";
import { useAuthState } from "../auth/use-auth-state";
import { useOnlineStatus } from "../core/use-online-status";
import { useTaskAccess } from "../sharing/use-list-access";
import { acquireNoteSession, releaseNoteSession } from "../../lib/notes/note-registry";
import { onNoteSaved } from "../../lib/notes/note-channel";
import { queryKeys } from "../../lib/api/query-keys";
import { noteStatus, type NoteSession, type NoteSessionState } from "../../lib/notes/note-session";

function useNoteSession(
    ready: boolean,
    userId: string | null,
    ownerId: string | null,
    legacy: React.RefObject<string>,
) {
    const queryClient = useQueryClient();
    const [held, setHeld] = useState<NoteSession | null>(null);
    useEffect(() => {
        if (!ready || !userId || !ownerId) return setHeld(null);
        const acquired = acquireNoteSession(queryClient, userId, ownerId, () => legacy.current);
        setHeld(acquired);
        void acquired.load();
        return () => releaseNoteSession(userId, ownerId);
        // oxlint-disable-next-line react/exhaustive-deps -- deps are deliberate here
    }, [ready, queryClient, userId, ownerId]);
    return held && held.owner === ownerId && held.userId === userId ? held : null;
}

function useRemoteNote(session: NoteSession | null, userId: string | null, ownerId: string | null, poll: boolean) {
    const queryClient = useQueryClient();
    const online = useOnlineStatus();
    const { data: remote } = useTaskNoteQuery(ownerId ?? null, { live: poll });
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

export function useTaskNote(taskId: string | null) {
    const task = useTask(taskId) ?? null;
    const ownerId = task ? getNoteOwnerTaskId(task) : taskId;
    const ownerTask = useTask(ownerId !== taskId ? ownerId : null);
    const noteOwnerTask = ownerTask ?? task;
    const { session: auth } = useAuthState();
    const userId = auth?.user.id ?? null;
    const legacy = useRef("");
    legacy.current = noteOwnerTask?.content ?? "";

    const session = useNoteSession(!!task && !!ownerId && !!userId, userId, ownerId, legacy);

    const state = useSyncExternalStore(
        (cb) => session?.subscribe(cb) ?? (() => undefined),
        () => session?.getSnapshot() ?? null,
        () => null,
    );
    const { isShared } = useTaskAccess(task ?? undefined);
    useRemoteNote(session, userId, ownerId, !isShared);

    return { task, noteOwnerTask, session, state, ...noteView(session, state) };
}

function noteView(session: NoteSession | null, state: NoteSessionState | null) {
    return {
        status: state ? noteStatus(state) : "loading",
        isLoading: !session || !state?.loaded,
        loadFailed: state?.loadFailed ?? false,
    };
}
