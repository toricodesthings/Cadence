import { useSyncExternalStore } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useMutationOutbox } from "../../lib/api/mutation-outbox";

function subscribe(cb: () => void) {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
    };
}

function getSnapshot() {
    return navigator.onLine;
}

function getServerSnapshot() {
    return true;
}

export function OfflineBanner() {
    const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const outbox = useMutationOutbox();

    if (isOnline && outbox.total === 0) return null;

    // Syncing state (back online with pending mutations)
    if (isOnline && outbox.replaying > 0) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-blue-900/90 px-4 py-2 text-sm font-medium text-blue-100 backdrop-blur-sm"
            >
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                Syncing {outbox.replaying} pending changes...
            </div>
        );
    }

    // Failed mutations
    if (isOnline && outbox.failed.length > 0) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-rose-900/90 px-4 py-2 text-sm font-medium text-rose-100 backdrop-blur-sm"
            >
                {outbox.failed.length} changes failed to sync
                <button
                    type="button"
                    onClick={outbox.retryFailed}
                    className="ml-2 rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold hover:bg-white/30"
                >
                    Retry
                </button>
                <button
                    type="button"
                    onClick={outbox.dismissFailed}
                    className="ml-1 rounded-md bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20"
                >
                    Dismiss
                </button>
            </div>
        );
    }

    if (!isOnline) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-amber-900/90 px-4 py-2 text-sm font-medium text-amber-100 backdrop-blur-sm"
            >
                <WifiOff size={14} aria-hidden="true" />
                You&apos;re offline
                {outbox.pending > 0 && ` — ${outbox.pending} changes queued`}
            </div>
        );
    }

    return null;
}
