import { useEffect, useRef, useState } from "react";
import { WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { useMutationOutbox } from "../../lib/api/mutation-outbox";
import { useOnlineStatus } from "../../hooks/core/use-online-status";
import { SyncReviewSheet } from "./SyncReviewSheet";

const changes = (count: number) => `${count} change${count === 1 ? "" : "s"}`;
/** Only a backlog that took a while earns a "synced" note; quick saves stay silent. */
const NOTICE_AFTER_MS = 5_000;
/** One slot for connection news, so offline → online → synced replace each other. */
const CONNECTION_TOAST = "connection";

function connectionToast(online: boolean) {
    toast.message(online ? "Oh hey, you're back online!" : "You're offline for now. Your changes will wait here.", {
        id: CONNECTION_TOAST,
        duration: 2_400,
        className: online ? "cadence-toast--online" : "cadence-toast--offline",
        icon: <span className="connection-dot" aria-hidden="true" />,
    });
}

export function OfflineBanner() {
    const isOnline = useOnlineStatus();
    const outbox = useMutationOutbox();
    const [reviewing, setReviewing] = useState(false);
    const waiting = outbox.pending + outbox.replaying;
    const since = useRef<number | null>(null);
    const wasOnline = useRef(isOnline);

    // A quick word when the connection changes; never on first load.
    useEffect(() => {
        if (wasOnline.current === isOnline) return;
        wasOnline.current = isOnline;
        connectionToast(isOnline);
    }, [isOnline]);

    useEffect(() => {
        if (waiting > 0) {
            since.current ??= Date.now();
            return;
        }
        if (since.current !== null && Date.now() - since.current > NOTICE_AFTER_MS && outbox.failed.length === 0) {
            toast.success("All changes synced", { id: CONNECTION_TOAST, duration: 2_400 });
        }
        since.current = null;
    }, [outbox.failed.length, waiting]);

    const banner = (() => {
        if (!isOnline) {
            return (
                <div role="status" aria-live="polite" className="offline-banner offline-banner--offline">
                    <WifiOff size={14} aria-hidden="true" />
                    You&apos;re offline{waiting > 0 && ` · ${changes(waiting)} will sync`}
                </div>
            );
        }
        if (outbox.replaying > 0) {
            return (
                <div role="status" aria-live="polite" className="offline-banner offline-banner--syncing">
                    <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                    Syncing {changes(waiting)}…
                </div>
            );
        }
        if (outbox.failed.length > 0) {
            return (
                <div role="status" aria-live="polite" className="offline-banner offline-banner--failed">
                    {changes(outbox.failed.length)} didn&apos;t sync
                    <button type="button" onClick={() => setReviewing(true)} className="offline-banner__action">
                        Review
                    </button>
                </div>
            );
        }
        if (waiting > 0) {
            // Online on paper, but requests aren't getting through (weak signal).
            return (
                <div role="status" aria-live="polite" className="offline-banner offline-banner--syncing">
                    <CloudUpload size={14} aria-hidden="true" />
                    {changes(waiting)} will sync when the connection steadies
                </div>
            );
        }
        return null;
    })();

    return (
        <>
            {banner}
            {outbox.failed.length > 0 && <SyncReviewSheet open={reviewing} onClose={() => setReviewing(false)} />}
        </>
    );
}
