import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Proposal } from "@cadence/domain/find-time";
import { formatInZone, type Zone } from "@cadence/domain/time";
import { formatTime } from "../../lib/utils/date-format";
import { proposalLabel } from "../../lib/planning/day-plan";
import { CADENCE_UNDO_DURATION } from "../../lib/utils/cadence-toast";
import { toastName } from "../../lib/utils/undo-toast";

const BUTTON =
    "min-h-9 pointer-coarse:min-h-11 cursor-pointer rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 text-[13px] font-medium text-twilight-text transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-default disabled:opacity-60";
const QUIET =
    "min-h-9 pointer-coarse:min-h-11 cursor-pointer rounded-full px-3 text-[13px] text-twilight-text-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/**
 * "Lab report · Tue 2:00 – 2:45pm" with Another time · Other day · Undo: the message Find a time leaves after it has
 * already put the task in the first gap that fits. Another time steps to the next gap, which never overlaps the last;
 * after the final one it says that's every gap and keeps Other day and Undo. Like every Undo toast it waits while
 * hovered or focused, and is announced politely with the whole sentence.
 */
export function FindTimeToast({
    id,
    title,
    zone,
    proposals,
    prefix,
    onApply,
    onOtherDay,
    onUndo,
}: {
    id: string | number;
    title: string;
    zone: Zone;
    proposals: readonly Proposal[];
    /** "Your calendar changed" when this is a second try. */
    prefix?: string;
    /** Writes the proposal at `index`; rejects when it couldn't. */
    onApply: (index: number) => Promise<void>;
    onOtherDay: () => void;
    onUndo: () => void;
}) {
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const proposal = proposals[index];
    const last = index >= proposals.length - 1;

    // Re-armed by every step. Hover and focus are read live when it fires, not counted from events.
    useEffect(() => {
        if (busy) return;
        let timer: ReturnType<typeof setTimeout>;
        const arm = (ms: number) => {
            timer = setTimeout(() => {
                const el = box.current;
                if (el && (el.matches(":hover") || el.contains(document.activeElement))) arm(1_000);
                else toast.dismiss(id);
            }, ms);
        };
        arm(CADENCE_UNDO_DURATION);
        return () => clearTimeout(timer);
    }, [id, index, busy]);

    const another = async () => {
        setBusy(true);
        try {
            await onApply(index + 1);
            setIndex(index + 1);
        } catch {
            // The write said why itself; the block stays where it was.
        } finally {
            setBusy(false);
        }
    };

    const day = formatInZone(proposal.start, zone, { weekday: "long" });
    const spoken = `${toastName(title, 40)} placed ${day}, ${formatTime(proposal.start)} to ${formatTime(proposal.end)}.`;
    return (
        <div
            ref={box}
            role="group"
            aria-label="Find a time"
            onKeyDown={(event) => {
                if (event.key === "Escape" && !busy) toast.dismiss(id);
            }}
            className="flex w-full max-w-sm flex-col gap-2 text-sm text-twilight-text"
        >
            <div role="status" aria-live="polite" className="contents">
                <span className="sr-only">{prefix ? `${prefix}. ` : ""}{spoken}</span>
                <p className="leading-snug" aria-hidden="true">
                    {prefix ? <span className="text-twilight-text-muted">{prefix} · </span> : null}
                    <span className="font-medium">{toastName(title, 40)}</span> · {proposalLabel(proposal, zone)}
                </p>
                {last && proposals.length > 1 ? (
                    <p className="text-xs text-twilight-text-muted">That’s every gap on {formatInZone(proposal.start, zone, { weekday: "short" })}</p>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {last ? null : (
                    <button type="button" disabled={busy} onClick={() => void another()} className={BUTTON}>
                        Another time
                    </button>
                )}
                <button type="button" disabled={busy} onClick={() => { toast.dismiss(id); onOtherDay(); }} className={BUTTON}>
                    Other day
                </button>
                <button type="button" disabled={busy} onClick={() => { toast.dismiss(id); onUndo(); }} className={QUIET}>
                    Undo
                </button>
            </div>
        </div>
    );
}

/**
 * "Lab report · Moved to Tue" with Undo, and "2:00 PM?" when that day has a gap: one tap puts the task in it. The offer
 * is a quiet question, never an obligation: leaving it keeps the day-only placement.
 */
export function PlaceReceiptToast({ id, title, description, offer, onOffer, onUndo }: {
    id: string | number;
    title: string;
    description: string;
    /** The first gap's start time, as the person reads it, or null when there is none. */
    offer: string | null;
    onOffer: () => void;
    onUndo: () => void;
}) {
    return (
        <div role="group" aria-label="Placed" className="flex w-full max-w-sm flex-col gap-1.5 text-sm text-twilight-text">
            <div role="status" aria-live="polite" className="contents">
                <p className="leading-snug"><span className="font-medium">{title}</span></p>
                <p className="text-xs text-twilight-text-muted">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {offer ? (
                    <button type="button" aria-label={`Put it at ${offer}`} onClick={() => { toast.dismiss(id); onOffer(); }} className={BUTTON}>
                        {offer}?
                    </button>
                ) : null}
                <button type="button" onClick={() => { toast.dismiss(id); onUndo(); }} className={QUIET}>
                    Undo
                </button>
            </div>
        </div>
    );
}
