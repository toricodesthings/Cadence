import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { NoteStatus as Status } from "../../../lib/notes/note-session";
import type { CollabPeer, CollabStatus } from "../../../lib/notes/collab-session";
import { cn } from "../../../lib/utils";
import { PersonAvatar } from "../../sharing/PersonAvatar";

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

const TONE: Partial<Record<Status, string>> = {
    "sync-failed": "text-feedback-error",
    "save-failed": "text-feedback-error",
    review: "text-feedback-error",
    "device-offline": "text-[var(--offline-accent,var(--accent-primary))]",
    "device-syncing": "text-[var(--offline-accent,var(--accent-primary))]",
};

function announcement(prev: Status, next: Status): string | null {
    if (prev === next || next === "loading") return null;
    const ordinary = (s: Status) => s === "saved" || s === "saving" || s === "loading";
    if (ordinary(next)) return next === "saved" && !ordinary(prev) ? "Saved" : null;
    return LABEL[next].replace(" · ", ". ");
}

export function NoteStatus({
    status,
    onAct,
    className,
}: {
    status: Status;
    onAct?: (status: Status) => void;
    className?: string;
}) {
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
            {status === "saving" || status === "device-syncing" ? (
                <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" />
            ) : null}
            <span>{label}</span>
        </>
    );
    const cls = cn(
        "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] tabular-nums",
        TONE[status] ?? "text-twilight-text-muted",
        className,
    );

    return (
        <>
            {actionable ? (
                <button
                    type="button"
                    onClick={() => onAct(status)}
                    className={cn(
                        cls,
                        "cursor-pointer hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50",
                    )}
                >
                    {body}
                </button>
            ) : (
                <span className={cls}>{body}</span>
            )}
            <span role="status" aria-live="polite" className="sr-only">
                {message}
            </span>
        </>
    );
}

const MAX_FACES = 4;

export function CollabNoteStatus({
    status,
    peers,
    self,
    projectId,
    className,
}: {
    status: CollabStatus;
    peers: CollabPeer[];
    self: { id: string; name: string };
    projectId: string | null | undefined;
    className?: string;
}) {
    const others = [...new Map(peers.filter((p) => p.userId !== self.id).map((p) => [p.userId, p])).values()];
    const ids = [self.id, ...others.map((p) => p.userId)];
    const shown = ids.slice(0, MAX_FACES);
    const extra = ids.length - shown.length;
    const names = [self.name, ...others.map((p) => p.name)];
    const label =
        status === "offline"
            ? "Offline"
            : status === "connecting"
              ? "Connecting…"
              : others.length
                ? `${names.slice(0, MAX_FACES).join(", ")} here`
                : "Only you here";

    return (
        <span
            role="status"
            aria-live="polite"
            className={cn("inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-2 text-[13px]", className)}
        >
            <span className="sr-only">{label}</span>
            {status === "connecting" ? (
                <LoaderCircle
                    size={14}
                    className="text-twilight-text-muted motion-safe:animate-spin"
                    aria-hidden="true"
                />
            ) : status === "offline" ? (
                <span aria-hidden="true" className="text-[var(--offline-accent,var(--accent-primary))]">
                    Offline
                </span>
            ) : (
                <span className="flex items-center -space-x-1.5">
                    {shown.map((id) => (
                        <span key={id} className="pointer-events-auto relative inline-flex">
                            <PersonAvatar projectId={projectId} userId={id} size={24} />
                            <span
                                aria-hidden="true"
                                className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-feedback-success ring-2 ring-[var(--panel-raised,transparent)]"
                            />
                        </span>
                    ))}
                    {extra > 0 ? (
                        <span aria-hidden="true" className="pl-2.5 text-twilight-text-muted">
                            +{extra}
                        </span>
                    ) : null}
                </span>
            )}
        </span>
    );
}
