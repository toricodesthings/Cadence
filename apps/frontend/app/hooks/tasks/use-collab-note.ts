import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CollabNoteHandle, collabColorFor, type CollabSnapshot } from "../../lib/notes/collab-session";
import { useAuthState } from "../auth/use-auth-state";

const EMPTY: CollabSnapshot = { status: "connecting", peers: [] };
const NOOP_SUB = () => () => {};

/**
 * Opens a live collaborative Yjs session for a shared task's note.
 * Disabled (returns `collab: null`) for unshared tasks so personal notes keep their offline-first `NoteSession`.
 */
export function useCollabNote(taskId: string | null | undefined, enabled: boolean, present = true) {
    const { authReady, isAuthenticated, session } = useAuthState();
    const userId = session?.user.id ?? "";
    const userName = session?.user.name?.trim() || "Member";
    const active = Boolean(enabled && taskId && authReady && isAuthenticated && typeof WebSocket !== "undefined");

    const user = useMemo(
        () => ({ id: userId, name: userName, color: collabColorFor(userId || "anon") }),
        [userName, userId],
    );

    // Created in the effect (not render) so StrictMode's mount/cleanup/mount never leaves a destroyed or leaked handle.
    const [collab, setCollab] = useState<CollabNoteHandle | null>(null);

    useEffect(() => {
        if (!active || !taskId) return;
        const handle = new CollabNoteHandle(taskId, user);
        setCollab(handle);
        return () => {
            handle.destroy();
            setCollab(null);
        };
    }, [active, taskId, user]);

    useEffect(() => {
        collab?.setPresent(present);
    }, [collab, present]);

    const snapshot = useSyncExternalStore(
        collab ? collab.subscribe : NOOP_SUB,
        collab ? collab.getSnapshot : () => EMPTY,
        () => EMPTY,
    );

    return {
        collab,
        collabUser: user,
        collabStatus: snapshot.status,
        peers: snapshot.peers,
    };
}
