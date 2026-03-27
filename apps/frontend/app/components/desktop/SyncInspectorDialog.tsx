import { RefreshCw, WifiOff, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../primitives/Dialog";
import { useMutationOutbox } from "../../lib/api/mutation-outbox";
import { useWorkspaceSync } from "../../hooks/core/use-workspace-sync";
import { useAvailableDesktopUpdate } from "../../platform/desktop-update-state";
import { useSyncExternalStore } from "react";

function subscribeToNetworkState(listener: () => void) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
    };
}

function getNetworkSnapshot() {
    return navigator.onLine;
}

function getServerNetworkSnapshot() {
    return true;
}

export function SyncInspectorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const isOnline = useSyncExternalStore(subscribeToNetworkState, getNetworkSnapshot, getServerNetworkSnapshot);
    const outbox = useMutationOutbox();
    const { sync, isSyncing, lastSyncedAt } = useWorkspaceSync();
    const update = useAvailableDesktopUpdate();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl border border-twilight-border bg-twilight-deep/95 p-0 shadow-[0_24px_72px_rgba(0,0,0,0.45)]">
                <div className="border-b border-twilight-border px-6 py-5">
                    <DialogTitle className="font-display text-2xl text-twilight-text">Sync Inspector</DialogTitle>
                    <DialogDescription className="mt-2 text-sm text-twilight-text-muted">
                        Inspect the current desktop sync state, queued offline changes, and pending updates.
                    </DialogDescription>
                </div>

                <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-twilight-text">
                            {isOnline ? <CheckCircle2 size={16} className="text-accent-primary" /> : <WifiOff size={16} className="text-amber-300" />}
                            Connectivity
                        </div>
                        <p className="mt-3 text-sm text-twilight-text-soft">
                            {isOnline ? "Online and ready to sync." : "Offline. Cadence will queue local changes until the connection returns."}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-twilight-text">
                            <Clock3 size={16} className="text-moonlit" />
                            Last activity
                        </div>
                        <p className="mt-3 text-sm text-twilight-text-soft">
                            {lastSyncedAt ? `Manual sync completed at ${lastSyncedAt.toLocaleTimeString()}.` : "No manual sync has been run in this session."}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 md:col-span-2">
                        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-twilight-text">
                            <RefreshCw size={16} className={isSyncing || outbox.replaying > 0 ? "sync-spin text-moonlit" : "text-twilight-text-soft"} />
                            Mutation outbox
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-twilight-text-muted">Pending</p>
                                <p className="mt-2 text-2xl font-semibold text-twilight-text">{outbox.pending}</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-twilight-text-muted">Replaying</p>
                                <p className="mt-2 text-2xl font-semibold text-twilight-text">{outbox.replaying}</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-twilight-text-muted">Failed</p>
                                <p className="mt-2 text-2xl font-semibold text-twilight-text">{outbox.failed.length}</p>
                            </div>
                        </div>

                        {outbox.failed.length > 0 ? (
                            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4 text-sm text-twilight-text-soft">
                                <div className="flex items-center gap-2 font-medium text-twilight-text">
                                    <AlertTriangle size={16} className="text-red-300" />
                                    Failed sync attempts need attention
                                </div>
                                <p className="mt-2">
                                    Retry failed changes once connectivity is stable, or dismiss stale failures after you verify that the underlying data is already consistent.
                                </p>
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 md:col-span-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-twilight-text">
                            <CheckCircle2 size={16} className="text-accent-primary" />
                            Updates
                        </div>
                        <p className="mt-3 text-sm text-twilight-text-soft">
                            {update ? `Cadence ${update.version} is ready to install.` : "No desktop update is currently staged."}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-twilight-border px-6 py-4">
                    {outbox.failed.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => outbox.dismissFailed()}
                            className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                        >
                            Dismiss failures
                        </button>
                    ) : null}
                    {outbox.failed.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => outbox.retryFailed()}
                            className="rounded-xl border border-accent-primary/25 bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/16"
                        >
                            Retry failed sync
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void sync()}
                        className="rounded-xl border border-moonlit/25 bg-moonlit/10 px-4 py-2 text-sm font-medium text-moonlit transition-colors hover:bg-moonlit/16"
                    >
                        {isSyncing ? "Syncing…" : "Sync now"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}