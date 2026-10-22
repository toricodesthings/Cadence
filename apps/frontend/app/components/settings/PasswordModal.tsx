import React, { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Input } from "../primitives";
import * as Dialog from "../primitives/Dialog";
import { authClient, authError } from "../../lib/auth-client";
import { queryKeys } from "../../lib/api/query-keys";

const MIN_PASSWORD_LENGTH = 8; // Better Auth's default minPasswordLength

type PasswordFieldProps = React.ComponentProps<typeof Input> & { id: string; label: string; hint?: string };

function PasswordField({ id, label, hint, ...props }: PasswordFieldProps) {
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-semibold text-twilight-text">{label}</label>
            <Input id={id} type="password" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
            {hint && <p id={`${id}-hint`} className="text-xs text-twilight-text-soft">{hint}</p>}
        </div>
    );
}

type CodeStepProps = { email: string; codeSent: boolean; otp: string; setOtp: (otp: string) => void; loading: boolean; onSend: () => void };

/** The emailed code: a button to send it, then the field for it. */
function CodeStep({ email, codeSent, otp, setOtp, loading, onSend }: CodeStepProps) {
    if (!codeSent) {
        return (
            <Button type="button" variant="secondary" onClick={onSend} disabled={loading}>
                {loading ? "Sending..." : "Email me a code"}
            </Button>
        );
    }
    return (
        <PasswordField
            id="password-otp"
            label="Code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.trim())}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            hint={`Check ${email}.`}
            autoFocus
        />
    );
}

type CurrentPasswordStepProps = { value: string; onChange: (value: string) => void; onForgot: () => void };

function CurrentPasswordStep({ value, onChange, onForgot }: CurrentPasswordStepProps) {
    return (
        <div className="flex flex-col gap-2">
            <PasswordField
                id="password-current"
                label="Current password"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete="current-password"
                autoFocus
            />
            <button
                type="button"
                className="self-start cursor-pointer rounded text-xs font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
                onClick={onForgot}
            >
                Forgot your password?
            </button>
        </div>
    );
}

type NewPasswordFieldsProps = { value: string; onChange: (value: string) => void; confirm: string; onConfirm: (value: string) => void; mismatch: boolean };

function NewPasswordFields({ value, onChange, confirm, onConfirm, mismatch }: NewPasswordFieldsProps) {
    return (
        <>
            <PasswordField
                id="password-new"
                label="New password"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            />
            <PasswordField
                id="password-confirm"
                label="Confirm new password"
                value={confirm}
                onChange={(e) => onConfirm(e.target.value)}
                autoComplete="new-password"
                aria-invalid={mismatch}
                hint={mismatch ? "Passwords don't match." : undefined}
            />
        </>
    );
}

type PasswordDraft = { useCode: boolean; codeSent: boolean; currentPassword: string; otp: string; newPassword: string; confirmPassword: string };

/** Long enough, confirmed, and proven: the current password, or the emailed code. */
function canSavePassword(draft: PasswordDraft) {
    const proven = draft.useCode ? draft.codeSent && draft.otp.length > 0 : draft.currentPassword.length > 0;
    return draft.newPassword.length >= MIN_PASSWORD_LENGTH && draft.newPassword === draft.confirmPassword && proven;
}

/**
 * Changes the password with the current one, or sets one with a code emailed to the account
 * address. The code path covers OAuth-only accounts (the OTP reset creates the credential
 * account) and anyone who forgot their current password.
 */
export function PasswordModal({ email, hasPassword }: { email: string; hasPassword: boolean }) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [useCode, setUseCode] = useState(!hasPassword);
    const [codeSent, setCodeSent] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, startAction] = useTransition();

    const reset = () => {
        setUseCode(!hasPassword);
        setCodeSent(false);
        setCurrentPassword("");
        setOtp("");
        setNewPassword("");
        setConfirmPassword("");
    };
    const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
    const canSave = canSavePassword({ useCode, codeSent, currentPassword, otp, newPassword, confirmPassword });
    const choosing = !useCode || codeSent;
    const title = hasPassword ? "Change password" : "Set a password";

    const sendCode = () => startAction(async () => {
        const error = await authError(authClient.emailOtp.requestPasswordReset({ email }));
        if (error) return void toast.error(error.message || "Couldn't send the code");
        setCodeSent(true);
        toast.success(`Code sent to ${email}`);
    });

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        startAction(async () => {
            const error = await authError(useCode
                ? authClient.emailOtp.resetPassword({ email, otp, password: newPassword })
                : authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }));
            if (error) return void toast.error(error.message || "Couldn't save your password");
            toast.success(hasPassword ? "Password changed" : "Password set. You can also sign in with your email now.");
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.auth.accounts });
        });
    };

    return (
        <Dialog.Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (isOpen) reset(); }}>
            <Dialog.DialogTrigger asChild>
                <Button variant="secondary" className="w-full sm:w-auto">
                    {title}
                </Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
                <form onSubmit={save}>
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>{title}</Dialog.DialogTitle>
                        <Dialog.DialogDescription>
                            {useCode
                                ? `We'll email a code to ${email} to confirm it's you.`
                                : "Other devices will be signed out."}
                        </Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <div className="py-4 flex flex-col gap-4">
                        {/* Lets password managers tie the new password to the right account. */}
                        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
                        {useCode
                            ? <CodeStep email={email} codeSent={codeSent} otp={otp} setOtp={setOtp} loading={loading} onSend={sendCode} />
                            : <CurrentPasswordStep value={currentPassword} onChange={setCurrentPassword} onForgot={() => setUseCode(true)} />}
                        {choosing && (
                            <NewPasswordFields value={newPassword} onChange={setNewPassword} confirm={confirmPassword} onConfirm={setConfirmPassword} mismatch={mismatch} />
                        )}
                    </div>
                    <Dialog.DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="primary" disabled={loading || !canSave}>
                            {loading && choosing ? "Saving..." : "Save password"}
                        </Button>
                    </Dialog.DialogFooter>
                </form>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
