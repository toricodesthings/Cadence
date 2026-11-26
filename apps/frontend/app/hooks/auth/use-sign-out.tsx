import { useState } from "react";
import * as AlertDialog from "../../components/primitives/AlertDialog";
import { Button } from "../../components/primitives/Button";
import { clearWal, getWalSnapshot } from "../../lib/api/offline-wal";
import { useWalEntries } from "../../lib/api/mutation-outbox";
import { useAuthState } from "./use-auth-state";
import { discardNoteSessions, flushNoteSessions, unsyncedNoteCount } from "../../lib/notes/note-registry";
import { clearNoteJournal } from "../../lib/notes/note-journal";
import { forgetThisDevice } from "../../lib/notifications/device-delivery";
import { forgetRoute } from "../../lib/resume-route";
import { syncAppBadge } from "../../platform/installed-app";
import { useApiClient } from "./use-api-client";

export function useSignOut() {
    const { completeSignOut, session } = useAuthState();
    const client = useApiClient();
    const queued = useWalEntries().length;
    const [notes, setNotes] = useState(0);
    const [asking, setAsking] = useState(false);
    const [pending, setPending] = useState(false);
    const total = queued + notes;

    const finish = async (dropQueue: boolean) => {
        setPending(true);
        try {
            if (dropQueue) {
                discardNoteSessions();
                await clearWal();
                if (session) await clearNoteJournal(session.user.id).catch(() => undefined);
            }
            await forgetThisDevice(client).catch(() => undefined);
            forgetRoute();
            await syncAppBadge(0);
            await completeSignOut();
        } finally {
            setPending(false);
        }
    };

    const signOut = async () => {
        setPending(true);
        await flushNoteSessions().finally(() => setPending(false));
        const unsynced = unsyncedNoteCount();
        setNotes(unsynced);
        return getWalSnapshot().length + unsynced > 0 ? setAsking(true) : finish(false);
    };

    const dialog = (
        <AlertDialog.Root open={asking} onOpenChange={setAsking}>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>Sign out with unsynced changes?</AlertDialog.Title>
                    <AlertDialog.Description>
                        {total === 1 ? "1 change hasn't" : `${total} changes haven't`} synced yet. Signing out now
                        deletes {total === 1 ? "it" : "them"} from this device.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md">
                            Stay signed in
                        </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="danger" size="md" onClick={() => void finish(true)}>
                            Sign out anyway
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );

    return { signOut, pending, dialog };
}
