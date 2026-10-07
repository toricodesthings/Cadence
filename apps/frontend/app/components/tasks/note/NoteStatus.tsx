import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { NoteStatus as Status } from "../../../lib/notes/note-session";
import { cn } from "../../../lib/utils";

const LABEL: Record<Status, string> = {
    loading: "",
    saved: "Saved",
    saving: "Saving…",
    "device-offline": "Saved on this device · Offline",
    "device-syncing": "Saved on this device · Syncing…",
    "sync-failed": "Couldn’t sync · Retry",
    review: "Review changes",
    "save-failed": "Couldn’t save · Copy note",
};

/** Only exceptions earn colour; the healthy baseline stays quiet. */
const TONE: Partial<Record<Status, string>> = {
    "sync-failed": "text-feedback-error",
    "save-failed": "text-feedback-error",
    review: "text-feedback-error",
    "device-offline": "text-[var(--offline-accent,var(--accent-primary))]",
    "device-syncing": "text-[var(--offline-accent,var(--accent-primary))]",
};

/** Meaningful transitions only: not saving ↔ saved on every pause, but anything out of the ordinary and its recovery. */
function announcement(prev: Status, next: Status): string | null {
    if (prev === next || next === "loading") return null;
    const ordinary = (s: Status) => s === "saved" || s === "saving" || s === "loading";
    if (ordinary(next)) return next === "saved" && !ordinary(prev) ? "Saved" : null;
    return LABEL[next].replace(" · ", ". ");
}

/**
 * The single, stable save indicator. Whenever it isn't "Saved" it is a button that does the next
 * useful thing (save now, retry, review, copy), so it never just reports a problem.
 */
export function NoteStatus({ status, onAct, className }: { status: Status; onAct?: (status: Status) => void; className?: string }) {
    const previous = useRef<Status>(status);
    const [message, setMessage] = useState("");
    useEffect(() => {
        const said = announcement(previous.current, status);
        previous.current = status;
        if (said) setMessage(said);
    }, [status]);

    if (status === "loading") return null;
    const label = LABEL[status];
    const actionable = status !== "saved" && onAct;
    const body = (
        <>
            {status === "saving" || status === "device-syncing" ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : null}
            <span>{label}</span>
        </>
    );
    const cls = cn("inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] tabular-nums", TONE[status] ?? "text-twilight-text-muted", className);

    return (
        <>
            {actionable ? (
                <button type="button" onClick={() => onAct(status)} className={cn(cls, "cursor-pointer hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50")}>
                    {body}
                </button>
            ) : (
                <span className={cls}>{body}</span>
            )}
            <span role="status" aria-live="polite" className="sr-only">{message}</span>
        </>
    );
}
