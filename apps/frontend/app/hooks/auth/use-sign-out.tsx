import { useState, useSyncExternalStore } from "react";
import * as AlertDialog from "../../components/primitives/AlertDialog";
import { Button } from "../../components/primitives/Button";
import { clearWal, getWalServerSnapshot, getWalSnapshot, subscribeWal } from "../../lib/api/offline-wal";
import { useAuthState } from "./use-auth-state";

/**
 * Sign-out for the user's own buttons: changes that haven't synced yet belong to
 * this account, so ask before dropping them. (Forced sign-outs keep the queue for
 * when the same account signs back in.) Render `dialog` next to the button.
 */
export function useSignOut() {
    const { completeSignOut } = useAuthState();
    const total = useSyncExternalStore(subscribeWal, getWalSnapshot, getWalServerSnapshot).length;
    const [asking, setAsking] = useState(false);
    const [pending, setPending] = useState(false);

    const finish = async (dropQueue: boolean) => {
        setPending(true);
        try {
            if (dropQueue) await clearWal();
            await completeSignOut();
        } finally {
            setPending(false);
        }
    };

    const signOut = () => (total > 0 ? (setAsking(true), Promise.resolve()) : finish(false));

    const dialog = (
        <AlertDialog.Root open={asking} onOpenChange={setAsking}>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>Sign out with unsynced changes?</AlertDialog.Title>
                    <AlertDialog.Description>
                        {total === 1 ? "1 change hasn't" : `${total} changes haven't`} synced yet. Signing out
                        now deletes {total === 1 ? "it" : "them"} from this device.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md">Stay signed in</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="danger" size="md" onClick={() => void finish(true)}>Sign out anyway</Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );

    return { signOut, pending, dialog };
}
