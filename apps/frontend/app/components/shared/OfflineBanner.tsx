import { WifiOff, RefreshCw } from "lucide-react";
import { useMutationOutbox } from "../../lib/api/mutation-outbox";
import { useOnlineStatus } from "../../hooks/core/use-online-status";

export function OfflineBanner() {
    const isOnline = useOnlineStatus();
    const outbox = useMutationOutbox();

    if (isOnline && outbox.total === 0) return null;

    // Syncing state (back online with pending mutations)
    if (isOnline && outbox.replaying > 0) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="offline-banner offline-banner--syncing"
            >
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                Syncing {outbox.replaying} pending changes…
            </div>
        );
    }

    // Failed mutations
    if (isOnline && outbox.failed.length > 0) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="offline-banner offline-banner--failed"
            >
                {outbox.failed.length} change{outbox.failed.length > 1 ? "s" : ""} failed to sync
                <button
                    type="button"
                    onClick={outbox.retryFailed}
                    className="offline-banner__action offline-banner__action--primary"
                >
                    Retry
                </button>
                <button
                    type="button"
                    onClick={outbox.dismissFailed}
                    className="offline-banner__action"
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
                className="offline-banner offline-banner--offline"
            >
                <WifiOff size={14} aria-hidden="true" />
                You&apos;re offline
                {outbox.pending > 0 && ` — ${outbox.pending} change${outbox.pending > 1 ? "s" : ""} queued`}
            </div>
        );
    }

    return null;
}
