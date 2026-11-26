import { useEffect, useRef, useState, useTransition } from "react";
import { LEGAL_VERSION } from "@cadence/contracts/settings";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { ConsentCheck, LegalLinks } from "../shared/ConsentCheck";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useSettings, useUpdateSettings } from "../../hooks/core/use-settings";
import { takeSignUpTicks } from "../../lib/legal-consent";
import { toastError } from "../../lib/utils/error-toast";

export function LegalConsentGate() {
    const { completeSignOut } = useAuthState();
    const { data: settings, dataUpdatedAt } = useSettings();
    const { mutateAsync } = useUpdateSettings();
    const [ticked, setTicked] = useState(false);
    const [pending, startTransition] = useTransition();
    const autoRecorded = useRef(false);

    const needed = !!settings && dataUpdatedAt > 0 && settings.privacy.legalVersion !== LEGAL_VERSION;

    const record = async (at: string) => {
        await mutateAsync({ privacy: { legalAcceptedAt: at, legalVersion: LEGAL_VERSION } });
    };

    useEffect(() => {
        if (!needed || autoRecorded.current) return;
        autoRecorded.current = true;
        const at = takeSignUpTicks();
        if (at)
            void record(at).catch(() => {
                autoRecorded.current = false;
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needed]);

    const accept = () =>
        startTransition(async () => {
            try {
                await record(new Date().toISOString());
            } catch (error) {
                toastError(error, "Couldn't save that. Try again.");
            }
        });

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
                    <Button variant="ghost" size="md" disabled={pending} onClick={() => void completeSignOut()}>
                        Sign out
                    </Button>
                    <Button size="md" disabled={!ticked || pending} onClick={() => void accept()}>
                        {pending ? "Saving…" : "Continue"}
                    </Button>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
