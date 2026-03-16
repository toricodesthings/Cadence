import React, { useState } from "react";
import { Button, Input } from "../../primitives";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { authClient } from "../../../lib/auth-client";
import { beginSocialLink, getAuthCallbackUrl } from "../../../platform/runtime";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import * as Dialog from "../../primitives/Dialog";
import { toast } from "sonner";
import { compressImageToBase64 } from "../../../lib/utils/image";

function FieldEditorModal({
    title,
    triggerText = "Edit",
    initialValue,
    onSave,
    placeholder = "",
    type = "text"
}: {
    title: string;
    triggerText?: string;
    initialValue: string;
    onSave: (val: string) => Promise<void>;
    placeholder?: string;
    type?: string;
}) {
    const [open, setOpen] = useState(false);
    const [val, setVal] = useState(initialValue);
    const [loading, setLoading] = useState(false);

    return (
        <Dialog.Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (isOpen) setVal(initialValue); }}>
            <Dialog.DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {triggerText}
                </Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>{title}</Dialog.DialogTitle>
                </Dialog.DialogHeader>
                <div className="py-4">
                    <Input
                        type={type}
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        placeholder={placeholder}
                        autoFocus
                    />
                </div>
                <Dialog.DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await onSave(val);
                                setOpen(false);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading || val === initialValue}
                    >
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </Dialog.DialogFooter>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

function BirthdayEditorModal({
    initialValue,
    onSave,
}: {
    initialValue: string | null;
    onSave: (val: string | null) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [val, setVal] = useState(initialValue || "");
    const [loading, setLoading] = useState(false);

    return (
        <Dialog.Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (isOpen) setVal(initialValue || ""); }}>
            <Dialog.DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {initialValue ? "Edit" : "Set"}
                </Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>Set Birthday</Dialog.DialogTitle>
                </Dialog.DialogHeader>
                <div className="py-4 flex flex-col gap-3">
                    <p className="text-sm text-warm-white/70">Your birthday will appear as an overlay on the Schedule calendar. You can clear it at any time.</p>
                    <Input
                        type="date"
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        autoFocus
                    />
                </div>
                <Dialog.DialogFooter>
                    {initialValue && (
                        <Button
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 mr-auto"
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    await onSave(null);
                                    setOpen(false);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                        >
                            Clear
                        </Button>
                    )}
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await onSave(val || null);
                                setOpen(false);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading || val === (initialValue || "")}
                    >
                        {loading ? "Saving..." : "Save"}
                    </Button>
                </Dialog.DialogFooter>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

function PasswordChangeModal() {
    const [open, setOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [loading, setLoading] = useState(false);

    return (
        <Dialog.Dialog open={open} onOpenChange={setOpen}>
            <Dialog.DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                    Update Password
                </Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>Change Password</Dialog.DialogTitle>
                </Dialog.DialogHeader>
                <div className="py-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-twilight-text">Current Password</label>
                        <Input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Current Password"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-twilight-text">New Password</label>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New Password"
                        />
                    </div>
                </div>
                <Dialog.DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={async () => {
                            setLoading(true);
                            const { error } = await authClient.changePassword({ newPassword, currentPassword, revokeOtherSessions: true });
                            setLoading(false);
                            if (error) {
                                toast.error(error.message || "Failed to change password");
                            } else {
                                toast.success("Password changed successfully");
                                setOpen(false);
                            }
                        }}
                        disabled={loading || !currentPassword || !newPassword}
                    >
                        {loading ? "Saving..." : "Update Password"}
                    </Button>
                </Dialog.DialogFooter>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

function TwoFactorModal() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

    const handleEnable = async () => {
        setLoading(true);
        // Using authClient.twoFactor methods (assuming standard better-auth plugin availability on Neon)
        try {
            // @ts-ignore
            const { error, data } = await authClient.twoFactor.enable({ password });
            if (error) {
                toast.error(error.message || "Failed to enable 2FA.");
            } else {
                toast.success("2FA enabled successfully.");
                if (data?.backupCodes) {
                    setBackupCodes(data.backupCodes);
                }
            }
        } catch (err: any) {
            toast.error(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const handleDisable = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            const { error } = await authClient.twoFactor.disable({ password });
            if (error) {
                toast.error(error.message || "Failed to disable 2FA.");
            } else {
                toast.success("2FA disabled.");
                setOpen(false);
                setBackupCodes(null);
                setPassword("");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog.Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) { setPassword(""); setBackupCodes(null); } }}>
            <Dialog.DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                    Manage 2FA
                </Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>Two-Factor Authentication</Dialog.DialogTitle>
                </Dialog.DialogHeader>
                <div className="py-4 flex flex-col gap-4">
                    {backupCodes ? (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-green-400 font-semibold">2FA is now enabled!</p>
                            <p className="text-xs text-warm-white/70">Please save these backup codes in a secure location. You will need them if you lose access to your authenticator device.</p>
                            <div className="bg-black/40 p-3 rounded border border-twilight-border grid grid-cols-2 gap-2 max-h-40 overflow-y-auto font-mono text-sm text-warm-white">
                                {backupCodes.map((code, i) => (
                                    <span key={i} className="tracking-wider">{code}</span>
                                ))}
                            </div>
                            <Button variant="secondary" onClick={() => setOpen(false)}>I have saved my backup codes</Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-warm-white/70">Enter your password to configure Two-Factor Authentication.</p>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Current Password"
                            />
                            <div className="flex gap-2 mt-2">
                                <Button
                                    variant="primary"
                                    onClick={handleEnable}
                                    disabled={loading || !password}
                                >
                                    Enable 2FA
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="text-red-400 hover:text-red-300"
                                    onClick={handleDisable}
                                    disabled={loading || !password}
                                >
                                    Disable 2FA
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

function OAuthConnectionsBlock() {
    const [accounts, setAccounts] = useState<any[] | null>(null);
    const [isPending, setIsPending] = useState(true);
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        setIsPending(true);
        // @ts-ignore Let's assume listAccounts exists on authClient, if not gracefully fail
        if (typeof authClient.listAccounts === "function") {
            authClient.listAccounts().then((res: any) => {
                setAccounts(res?.data || []);
                setIsPending(false);
            }).catch(() => {
                setAccounts([]);
                setIsPending(false);
            });
        } else {
            setAccounts([]);
            setIsPending(false);
        }
    }, []);

    const obfuscateId = (id: string) => {
        if (!id) return "";
        if (id.includes("@")) {
            const [username, domain] = id.split("@");
            if (username.length <= 2) return `${username}***@${domain}`;
            return `${username.slice(0, 3)}****@${domain}`;
        }
        if (id.length <= 4) return id;
        return `${id.slice(0, 4)}****${id.slice(-2)}`;
    };

    const ProviderLogo = ({ provider }: { provider: string }) => {
        if (provider === 'google') {
            return (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                    />
                </svg>
            );
        }
        if (provider === 'github') {
            return (
                <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
            );
        }
        return null;
    };

    return (
        <div className="bg-black/20 rounded-2xl p-5 flex flex-col gap-4 border border-twilight-border mt-2 overflow-hidden relative">
            {/* Subtle background glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-lantern/5 blur-3xl pointer-events-none" />

            {isPending ? (
                <div className="flex items-center gap-3 py-2">
                    <div className="w-4 h-4 rounded-full border-2 border-warm-white/20 border-t-warm-white/60 animate-spin" />
                    <p className="text-sm text-warm-white/40 font-medium">Synchronizing connections...</p>
                </div>
            ) : accounts && accounts.length > 0 ? (
                <div className="flex flex-col gap-1">
                    {accounts.map((acc: any) => (
                        <div key={acc.id} className="flex justify-between items-center group/acc px-3 py-3 rounded-xl hover:bg-white/[0.03] transition-all border border-transparent hover:border-twilight-border">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center border border-twilight-border group-hover/acc:bg-white/[0.06] transition-colors">
                                    <ProviderLogo provider={acc.providerId} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm text-warm-white font-semibold capitalize tracking-tight flex items-center gap-2">
                                        {acc.providerId}
                                        <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/20 font-bold uppercase tracking-widest">Linked</span>
                                    </span>
                                    <span className="text-xs text-warm-white/30 font-mono mt-0.5">
                                        {obfuscateId(acc.accountId || "")}
                                    </span>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400/60 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover/acc:opacity-100 transition-all scale-95 group-hover/acc:scale-100 h-8 font-medium"
                                onClick={async () => {
                                    setLoading(true);
                                    const { error } = await authClient.unlinkAccount({ providerId: acc.providerId });
                                    setLoading(false);
                                    if (error) toast.error("Failed to unlink account");
                                    else {
                                        toast.success(`Unlinked ${acc.providerId}`);
                                        setAccounts(accounts.filter(a => a.id !== acc.id));
                                    }
                                }}
                                disabled={loading}
                            >
                                Disconnect
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-4 px-2">
                    <p className="text-sm text-warm-white/30 italic">No third-party accounts connected. Use the options below to link one.</p>
                </div>
            )}

            <div className="pt-4 border-t border-twilight-border flex flex-wrap gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 px-4 gap-2 font-medium"
                    disabled={loading || accounts?.some((a: any) => a.providerId === 'google')}
                    onClick={async () => {
                        await beginSocialLink("google", getAuthCallbackUrl(window.location.pathname));
                    }}
                >
                    <ProviderLogo provider="google" />
                    Connect Google
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 px-4 gap-2 font-medium"
                    disabled={loading || accounts?.some((a: any) => a.providerId === 'github')}
                    onClick={async () => {
                        await beginSocialLink("github", getAuthCallbackUrl(window.location.pathname));
                    }}
                >
                    <ProviderLogo provider="github" />
                    Connect GitHub
                </Button>
            </div>
        </div>
    );
}

function SessionsBlock() {
    const [sessions, setSessions] = useState<any[] | null>(null);
    const [isPending, setIsPending] = useState(true);
    const { data: currentSession } = authClient.useSession();
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        setIsPending(true);
        // @ts-ignore
        if (typeof authClient.listSessions === "function") {
            authClient.listSessions().then((res: any) => {
                setSessions(res?.data || []);
                setIsPending(false);
            }).catch(() => {
                setSessions([]);
                setIsPending(false);
            });
        } else {
            setSessions([]);
            setIsPending(false);
        }
    }, []);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-warm-white/50 -mt-2 mb-2">
                Manage all devices that are currently signed in to your account.
            </p>
            <div className="bg-black/20 rounded-xl p-4 flex flex-col gap-3 border border-twilight-border">
                {isPending ? (
                    <p className="text-sm text-warm-white/50">Loading sessions...</p>
                ) : sessions && sessions.length > 0 ? (
                    sessions.map((sess: any) => {
                        const isCurrent = sess.id === currentSession?.session.id;
                        return (
                            <div key={sess.id} className={`flex justify-between items-center group/session ${isCurrent ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/5 border-twilight-border'} border rounded-lg p-3 transition-colors`}>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm text-warm-white font-medium flex items-center gap-2">
                                        {isCurrent ? "Current Device" : "Other Device"}
                                        {isCurrent && <span className="text-[10px] bg-amber-500/20 text-amber-200 px-1.5 rounded uppercase font-bold tracking-wider">Active</span>}
                                    </span>
                                    <span className="text-[11px] text-warm-white/40 truncate max-w-[250px]" title={sess.userAgent || "Unknown Device"}>
                                        {sess.userAgent?.split(' ')[0] || "Unknown Browser"} - {sess.ipAddress}
                                    </span>
                                    <span className="text-[10px] text-warm-white/30 italic">
                                        Active: {new Date(sess.updatedAt).toLocaleString()}
                                    </span>
                                </div>
                                {!isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10 opacity-0 group-hover/session:opacity-100 transition-opacity"
                                        onClick={async () => {
                                            setLoading(true);
                                            const { error } = await authClient.revokeSession({ token: sess.token });
                                            setLoading(false);
                                            if (error) toast.error("Failed to log out device");
                                            else {
                                                toast.success("Device logged out successfully");
                                                setSessions(sessions.filter(s => s.id !== sess.id));
                                            }
                                        }}
                                        disabled={loading}
                                    >
                                        Log Out
                                    </Button>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <p className="text-sm text-warm-white/50">No sessions found.</p>
                )}
            </div>
        </div>
    );
}

function AvatarEditModal({ userImage, onProfileUpdated }: { userImage?: string | null; onProfileUpdated: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset the input so they can select the same file again if they cancel
        e.target.value = '';

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File is too large. Please select an image under 5MB.");
            return;
        }

        try {
            // Let the UI know something is happening if we want, but compression is fast
            const base64Avatar = await compressImageToBase64(file);
            setPreviewImage(base64Avatar);
            setOpen(true);
        } catch (error) {
            toast.error("Error formatting uploaded image.");
        }
    };

    const handleSave = async () => {
        if (!previewImage) return;
        setLoading(true);
        const { error } = await authClient.updateUser({ image: previewImage });
        setLoading(false);
        if (error) {
            toast.error(error.message || "Failed to update profile picture");
        } else {
            await onProfileUpdated();
            toast.success("Profile picture updated");
            setOpen(false);
            setPreviewImage("");
        }
    };

    return (
        <>
            <label className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer">
                <span className="text-xl">📷</span>
                <span className="text-[10px] font-semibold text-white uppercase tracking-wider mt-1">Change</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileUpload} />
            </label>

            <Dialog.Dialog open={open} onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) setPreviewImage("");
            }}>
                <Dialog.DialogContent className="max-w-sm">
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Preview Profile Picture</Dialog.DialogTitle>
                    </Dialog.DialogHeader>
                    <div className="py-6 flex flex-col items-center justify-center gap-4">
                        <div className="w-32 h-32 bg-twilight-base rounded-full border-4 border-twilight-surface shadow-lg overflow-hidden flex items-center justify-center relative">
                            {previewImage ? (
                                <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-4xl text-warm-white/20">👤</span>
                            )}
                            {loading && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-warm-white/70 text-center">
                            Looking good! Ready to update your profile?
                        </p>
                    </div>
                    <Dialog.DialogFooter>
                        <Button variant="ghost" onClick={() => { setOpen(false); setPreviewImage(""); }} disabled={loading}>Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            disabled={loading || !previewImage}
                        >
                            {loading ? "Saving..." : "Save Image"}
                        </Button>
                    </Dialog.DialogFooter>
                </Dialog.DialogContent>
            </Dialog.Dialog>
        </>
    );
}

export function AccountTab() {
    const { data: sessionData, isPending, refetch: refetchSession } = authClient.useSession();
    const user = sessionData?.user;

    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const profileSettings = settings?.profile || { pronouns: "", birthday: null };

    const handleUpdateUser = async (field: "name" | "image", value: string) => {
        const { error } = await authClient.updateUser({ [field]: value });
        if (error) {
            toast.error(error.message || `Failed to update ${field}`);
        } else {
            toast.success(`${field} updated successfully`);
            await refetchSession(); // Force UI update
        }
    };

    const handleUpdateEmail = async (val: string) => {
        const { error } = await authClient.changeEmail({ newEmail: val });
        if (error) {
            toast.error(error.message || "Failed to update email");
        } else {
            toast.success("Check your new email to verify the address change");
        }
    };

    const handleUpdateSettings = async (field: "pronouns" | "birthday", value: string | null) => {
        updateSettings.mutate({ profile: { ...profileSettings, [field]: value } });
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="text-2xl font-bold text-twilight-text mb-2">Profile & Security</h2>

            {/* Account Card */}
            <div className="profile-card-bg rounded-2xl border border-twilight-border overflow-hidden">
                <div className="h-32 relative border-b border-twilight-border isolate">
                    {/* Inner wrapper specifically for overflow hidden background constraints */}
                    <div className="absolute inset-0 overflow-hidden bg-twilight-surface -z-10 profile-banner-bg">
                        {/* Atmospheric glow blobs per Manifesto */}
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[var(--color-lantern)] opacity-[0.14] rounded-full blur-[80px] pointer-events-none" />
                        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[var(--color-moonlit)] opacity-[0.12] rounded-full blur-[80px] pointer-events-none" />

                        {/* Abstract Topological SVG Waves */}
                        <svg className="absolute inset-0 w-full h-full opacity-30 mix-blend-overlay pointer-events-none" preserveAspectRatio="none" viewBox="0 0 1000 200" xmlns="http://www.w3.org/2000/svg">
                            <path d="M-100,100 C200,50 400,150 700,80 C900,30 1100,120 1200,60 L1200,200 L-100,200 Z" fill="url(#moonlitGlow)" />
                            <path d="M-50,250 C150,150 500,250 800,100 C1000,0 1150,150 1250,50 L1250,-50 L-50,-50 Z" fill="url(#amberGlow)" />

                            <defs>
                                <linearGradient id="moonlitGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="var(--color-moonlit)" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                                </linearGradient>
                                <linearGradient id="amberGlow" x1="100%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="var(--color-lantern)" stopOpacity="0.5" />
                                    <stop offset="100%" stopColor="transparent" stopOpacity="0.1" />
                                </linearGradient>
                            </defs>
                        </svg>

                        {/* Star / Lantern Sparks Geometry */}
                        <svg className="absolute right-[15%] top-6 w-12 h-12 opacity-40 text-[var(--color-lantern)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" fill="currentColor" />
                        </svg>
                        <svg className="absolute left-[30%] top-10 w-6 h-6 opacity-30 text-[var(--color-moonlit)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M50 0 L53 47 L100 50 L53 53 L50 100 L47 53 L0 50 L47 47 Z" fill="currentColor" />
                        </svg>
                    </div>

                    <div className="absolute -bottom-10 left-6 group/avatar z-10">
                        <div className="w-20 h-20 bg-twilight-base rounded-full border-4 border-twilight-surface flex items-center justify-center overflow-hidden relative">
                            {user?.image ? (
                                <img src={user.image} alt={user.name || "User"} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-3xl">👤</span>
                            )}
                                <AvatarEditModal userImage={user?.image} onProfileUpdated={refetchSession} />
                        </div>
                    </div>
                </div>
                <div className="pt-14 pb-6 px-6 relative">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold text-warm-white flex items-center gap-2">
                            {isPending ? "Loading..." : user ? (user.name || "Cadence User") : "Guest User"}
                            {user?.id && <span className="text-warm-white/40 font-normal text-sm">#{user.id.slice(0, 4)}</span>}
                        </h3>
                    </div>

                    <div className="mt-8 bg-black/20 rounded-xl p-4 flex flex-col gap-4 border border-twilight-border">
                        <div className="flex justify-between items-center group">
                            <div>
                                <p className="text-xs font-semibold text-warm-white/50 uppercase tracking-wider mb-1">Display Name</p>
                                <p className="text-sm text-warm-white">{isPending ? "..." : (user?.name || "None")}</p>
                            </div>
                            <FieldEditorModal
                                title="Edit Display Name"
                                initialValue={user?.name || ""}
                                onSave={async (val) => await handleUpdateUser("name", val)}
                                placeholder="Your full name"
                            />
                        </div>
                        <div className="flex justify-between items-center group">
                            <div>
                                <p className="text-xs font-semibold text-warm-white/50 uppercase tracking-wider mb-1">Pronouns</p>
                                <p className="text-sm text-warm-white">{profileSettings.pronouns || "Not set"}</p>
                            </div>
                            <FieldEditorModal
                                title="Add Pronouns"
                                initialValue={profileSettings.pronouns || ""}
                                onSave={async (val) => await handleUpdateSettings("pronouns", val)}
                                placeholder="they/them"
                            />
                        </div>
                        <div className="flex justify-between items-center group">
                            <div>
                                <p className="text-xs font-semibold text-warm-white/50 uppercase tracking-wider mb-1">Email</p>
                                <p className="text-sm text-warm-white flex items-center gap-2">
                                    {isPending ? "..." : (user?.email || "No email provided")}
                                </p>
                            </div>
                            <FieldEditorModal
                                title="Change Email"
                                initialValue={user?.email || ""}
                                onSave={async (val) => await handleUpdateEmail(val)}
                                placeholder="new@example.com"
                                type="email"
                            />
                        </div>
                        <div className="flex justify-between items-center group">
                            <div>
                                <p className="text-xs font-semibold text-warm-white/50 uppercase tracking-wider mb-1">Birthday</p>
                                <p className="text-sm text-warm-white">
                                    {profileSettings.birthday
                                        ? new Date(profileSettings.birthday + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
                                        : "Not set"}
                                </p>
                            </div>
                            <BirthdayEditorModal
                                initialValue={profileSettings.birthday}
                                onSave={async (val) => await handleUpdateSettings("birthday", val)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <SettingsSection title="Password and Authentication">
                <SettingsRow
                    title="Change Password"
                >
                    <PasswordChangeModal />
                </SettingsRow>
                <SettingsRow
                    title="Two-Factor Authentication"
                    description="Protect your account with an extra layer of security and generate backup codes."
                >
                    <TwoFactorModal />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="OAuth Connections">
                <p className="text-sm text-warm-white/50 -mt-2 mb-2">
                    Connect to sign in quickly using external providers like Google and GitHub.
                </p>
                <OAuthConnectionsBlock />
            </SettingsSection>

            <SettingsSection title="Active Devices">
                <SessionsBlock />
            </SettingsSection>
        </div>
    );
}
