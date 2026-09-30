import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ACCOUNT_DELETE_PHRASE } from "@cadence/contracts/account";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { Input } from "../primitives/Input";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useLinkedAccounts } from "../../hooks/auth/use-linked-accounts";
import { authClient, authError } from "../../lib/auth-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { createIDBPersister } from "../../lib/api/persister";
import { clearWal } from "../../lib/api/offline-wal";
import { toastError } from "../../lib/utils/error-toast";

/**
 * Permanent account deletion. The button stays off until the phrase is typed and the person proves it's them:
 * their password, or (Google/GitHub accounts without one) a code emailed to them. The server checks that proof
 * itself, so a stolen session can't delete an account. There is no undo.
 */
export function DeleteAccountDialog() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { completeSignOut, session } = useAuthState();
    const { data: accounts, isPending: accountsLoading } = useLinkedAccounts();
    const email = session?.user.email ?? "";
    const hasPassword = accounts?.some((a) => a.providerId === "credential") ?? false;

    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const [sending, setSending] = useState(false);
    const [pending, setPending] = useState(false);

    const confirmed = typed.trim().toLowerCase() === ACCOUNT_DELETE_PHRASE;
    const proven = hasPassword ? password.length > 0 : codeSent && otp.trim().length > 0;

    const reset = () => {
        setTyped("");
        setPassword("");
        setOtp("");
        setCodeSent(false);
    };

    const sendCode = async () => {
        setSending(true);
        const error = await authError(authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }));
        setSending(false);
        if (error) return void toast.error(error.message || "Couldn't send the code");
        setCodeSent(true);
        toast.success(`Code sent to ${email}`);
    };

    const remove = async () => {
        setPending(true);
        try {
            const proof = hasPassword ? { password } : { otp: otp.trim() };
            await unwrapResponse(await client.api.account.delete.$post({ json: { confirmation: ACCOUNT_DELETE_PHRASE, ...proof } }));
        } catch (error) {
            setPending(false);
            toastError(error, "Couldn't delete your account. Nothing was removed; try again.");
            return;
        }
        // The account is gone: drop everything this device kept for it, then leave
        queryClient.clear();
        await Promise.allSettled([clearWal(), createIDBPersister().removeClient()]);
        toast.success("Your account was deleted.");
        await completeSignOut();
    };

    return (
        <AlertDialog.Root open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); reset(); } }}>
            <AlertDialog.Trigger asChild>
                <Button variant="danger">Delete account</Button>
            </AlertDialog.Trigger>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>Delete your account permanently?</AlertDialog.Title>
                    <AlertDialog.Description>
                        This erases your tasks, notes, routines, events, settings, assistant conversations, photos and
                        connected assistants, and removes your sign-in. It cannot be undone and nothing can be
                        restored, not by you and not by us.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <label className="mt-4 block text-sm text-twilight-text-soft">
                    Type <strong className="text-twilight-text">{ACCOUNT_DELETE_PHRASE}</strong> to confirm
                    <div className="mt-2">
                        <Input
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            disabled={pending}
                        />
                    </div>
                </label>

                {accountsLoading ? null : hasPassword ? (
                    <label className="mt-4 block text-sm text-twilight-text-soft">
                        Your password
                        <div className="mt-2">
                            <Input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                disabled={pending}
                            />
                        </div>
                    </label>
                ) : (
                    <div className="mt-4 text-sm text-twilight-text-soft">
                        <p>
                            You sign in with Google or GitHub, so confirm it's you with a code sent to{" "}
                            <strong className="text-twilight-text">{email}</strong>.
                        </p>
                        {codeSent ? (
                            <label className="mt-3 block">
                                Code from the email
                                <div className="mt-2 flex gap-2">
                                    <Input
                                        value={otp}
                                        onChange={(event) => setOtp(event.target.value)}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        disabled={pending}
                                    />
                                    <Button variant="ghost" size="md" disabled={sending || pending} onClick={() => void sendCode()}>
                                        Resend
                                    </Button>
                                </div>
                            </label>
                        ) : (
                            <Button variant="secondary" size="md" className="mt-3" disabled={sending || !email} onClick={() => void sendCode()}>
                                {sending ? "Sending…" : "Email me a code"}
                            </Button>
                        )}
                    </div>
                )}

                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md" disabled={pending}>Keep my account</Button>
                    </AlertDialog.Cancel>
                    {/* A plain button, not AlertDialog.Action: Action closes the dialog before the request finishes */}
                    <Button variant="danger" size="md" disabled={!confirmed || !proven || pending} onClick={() => void remove()}>
                        {pending ? "Deleting…" : "Delete everything"}
                    </Button>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
