import { X } from "lucide-react";
import type { PlanningOffer } from "@cadence/contracts/planning";
import { OFFER_LABEL } from "../../hooks/ai/use-planning-offers";

/**
 * One quiet question under a row: "Break into steps?" or "Leave for later?", and an × for Not now. No sound, no
 * badge, no count; it appears only at a planning moment and goes the moment it is answered.
 */
export function PlanningOfferChip({ kind, onAccept, onNotNow }: { kind: PlanningOffer; onAccept: () => void; onNotNow: () => void }) {
    return (
        <div role="group" aria-label="Suggestion" className="flex w-fit items-center gap-0.5 rounded-full border border-accent-primary/25 bg-accent-primary/8 pl-1 text-[13px]">
            <button
                type="button"
                onClick={onAccept}
                className="min-h-11 cursor-pointer rounded-full px-3 font-medium text-twilight-text hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 pointer-fine:min-h-9"
            >
                {OFFER_LABEL[kind]}?
            </button>
            <button
                type="button"
                onClick={onNotNow}
                aria-label="Not now"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-twilight-text-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 pointer-fine:h-9 pointer-fine:w-9"
            >
                <X size={14} aria-hidden="true" />
            </button>
        </div>
    );
}
