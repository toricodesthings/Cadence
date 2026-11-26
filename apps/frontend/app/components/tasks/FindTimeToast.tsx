import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Proposal } from "@cadence/domain/find-time";
import { formatInZone, type Zone } from "@cadence/domain/time";
import { formatTime } from "../../lib/utils/date-format";
import { proposalLabel } from "../../lib/planning/day-plan";
import { CADENCE_UNDO_DURATION } from "../../lib/utils/cadence-toast";
import { toastName } from "../../lib/utils/undo-toast";
import { useToastLinger } from "../../hooks/ui/use-toast-linger";

const BUTTON =
    "min-h-9 pointer-coarse:min-h-11 cursor-pointer rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 text-[13px] font-medium text-twilight-text transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-default disabled:opacity-60";
const QUIET =
    "min-h-9 pointer-coarse:min-h-11 cursor-pointer rounded-full px-3 text-[13px] text-twilight-text-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

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
    prefix?: string;
    onApply: (index: number) => Promise<void>;
    onOtherDay: () => void;
    onUndo: () => void;
}) {
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    const proposal = proposals[index];
    const last = index >= proposals.length - 1;

    useToastLinger(id, box, CADENCE_UNDO_DURATION, busy, index);

    const another = async () => {
        setBusy(true);
        try {
            await onApply(index + 1);
            setIndex(index + 1);
        } catch {
        } finally {
            setBusy(false);
        }
    };

    const day = formatInZone(proposal.start, zone, { weekday: "long" });
    const spoken = `${toastName(title, 40)} placed ${day}, ${formatTime(proposal.start)} to ${formatTime(proposal.end)}.`;
    return (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- pointer convenience; keyboard path is on the inner controls
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
                <span className="sr-only">
                    {prefix ? `${prefix}. ` : ""}
                    {spoken}
                </span>
                <p className="leading-snug" aria-hidden="true">
                    {prefix ? <span className="text-twilight-text-muted">{prefix} · </span> : null}
                    <span className="font-medium">{toastName(title, 40)}</span> · {proposalLabel(proposal, zone)}
                </p>
                {last && proposals.length > 1 ? (
                    <p className="text-xs text-twilight-text-muted">
                        That’s every gap on {formatInZone(proposal.start, zone, { weekday: "short" })}
                    </p>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {last ? null : (
                    <button type="button" disabled={busy} onClick={() => void another()} className={BUTTON}>
                        Another time
                    </button>
                )}
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        toast.dismiss(id);
                        onOtherDay();
                    }}
                    className={BUTTON}
                >
                    Other day
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        toast.dismiss(id);
                        onUndo();
                    }}
                    className={QUIET}
                >
                    Undo
                </button>
            </div>
        </div>
    );
}

export function PlaceReceiptToast({
    id,
    title,
    description,
    offer,
    onOffer,
    onUndo,
}: {
    id: string | number;
    title: string;
    description: string;
    offer: string | null;
    onOffer: () => void;
    onUndo: () => void;
}) {
    return (
        <div
            role="group"
            aria-label="Placed"
            className="flex w-full max-w-sm flex-col gap-1.5 text-sm text-twilight-text"
        >
            <div role="status" aria-live="polite" className="contents">
                <p className="leading-snug">
                    <span className="font-medium">{title}</span>
                </p>
                <p className="text-xs text-twilight-text-muted">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {offer ? (
                    <button
                        type="button"
                        aria-label={`Put it at ${offer}`}
                        onClick={() => {
                            toast.dismiss(id);
                            onOffer();
                        }}
                        className={BUTTON}
                    >
                        {offer}?
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={() => {
                        toast.dismiss(id);
                        onUndo();
                    }}
                    className={QUIET}
                >
                    Undo
                </button>
            </div>
        </div>
    );
}
