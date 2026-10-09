import { useEffect, useRef, useState } from "react";
import { LEGAL_VERSION } from "@cadence/contracts/settings";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { ConsentCheck, LegalLinks } from "../shared/ConsentCheck";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useSettings, useUpdateSettings } from "../../hooks/core/use-settings";
import { takeSignUpTicks } from "../../lib/legal-consent";
import { toastError } from "../../lib/utils/error-toast";

/**
 * Signed in but never accepted the current Terms and Privacy Policy: a new Google/GitHub account made from the
 * sign-in page, or an existing account from before this step. Nothing in the workspace is usable until the person
 * accepts or signs out. Anyone who ticked on the sign-up page already said it, so that is recorded quietly.
 */
export function LegalConsentGate() {
    const { completeSignOut } = useAuthState();
    // `dataUpdatedAt` is 0 while only the device's cached copy is showing, which may predate the acceptance
    const { data: settings, dataUpdatedAt } = useSettings();
    const { mutateAsync } = useUpdateSettings();
    const [ticked, setTicked] = useState(false);
    const [pending, setPending] = useState(false);
    const autoRecorded = useRef(false);

    const needed = !!settings && dataUpdatedAt > 0 && settings.privacy.legalVersion !== LEGAL_VERSION;

    const record = async (at: string) => {
        await mutateAsync({ privacy: { legalAcceptedAt: at, legalVersion: LEGAL_VERSION } });
    };

    useEffect(() => {
        if (!needed || autoRecorded.current) return;
        autoRecorded.current = true;
        const at = takeSignUpTicks();
        if (at) void record(at).catch(() => { autoRecorded.current = false; });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needed]);

    const accept = async () => {
        setPending(true);
        try {
            await record(new Date().toISOString());
        } catch (error) {
            toastError(error, "Couldn't save that. Try again.");
        } finally {
            setPending(false);
        }
    };

    return (
        <AlertDialog.Root open={needed}>
            <AlertDialog.Content onEscapeKeyDown={(event) => event.preventDefault()}>
                <AlertDialog.Header>
                    <AlertDialog.Title>One last step</AlertDialog.Title>
                    <AlertDialog.Description>
                        Before you continue, please confirm your age and the terms for using Cadence.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <div className="mt-4">
                    <ConsentCheck checked={ticked} onChange={setTicked}>
                        I am 16 or older, and I accept the <LegalLinks />.
                    </ConsentCheck>
                </div>
                <AlertDialog.Footer>
                    <Button variant="ghost" size="md" disabled={pending} onClick={() => void completeSignOut()}>Sign out</Button>
                    <Button size="md" disabled={!ticked || pending} onClick={() => void accept()}>
                        {pending ? "Saving…" : "Continue"}
                    </Button>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
