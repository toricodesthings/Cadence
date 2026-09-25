import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tip } from "../primitives/Tooltip";

const ARROW = "btn-icon cursor-pointer rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text";

/** Jumps back to the period holding today; greyed out while you're already there. `compact` is the phone header's small pill. */
export function PeriodTodayButton({ isCurrent, onToday, compact = false }: { isCurrent: boolean; onToday: () => void; compact?: boolean }) {
    return (
        <button
            type="button"
            onClick={onToday}
            disabled={isCurrent}
            className={`cursor-pointer border border-twilight-border/30 bg-white/[0.03] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text disabled:pointer-events-none disabled:opacity-30 ${compact ? "ml-auto rounded-lg px-3 py-1 text-[13px]" : "inline-flex min-h-11 items-center rounded-xl px-3.5 text-sm"}`}
        >
            Today
        </button>
    );
}

/** Page header period nav: ‹ Today ›. `unit` names the step for the arrows ("week" → "Previous week"). */
export function PeriodNav({ unit, isCurrent, onNavigate, onToday }: {
    unit: string;
    isCurrent: boolean;
    onNavigate: (delta: number) => void;
    onToday: () => void;
}) {
    return (
        <div className="flex items-center gap-1">
            <Tip label={`Previous ${unit}`}>
                <button type="button" onClick={() => onNavigate(-1)} className={ARROW} aria-label={`Previous ${unit}`}>
                    <ChevronLeft size={16} aria-hidden="true" />
                </button>
            </Tip>
            <PeriodTodayButton isCurrent={isCurrent} onToday={onToday} />
            <Tip label={`Next ${unit}`}>
                <button type="button" onClick={() => onNavigate(1)} className={ARROW} aria-label={`Next ${unit}`}>
                    <ChevronRight size={16} aria-hidden="true" />
                </button>
            </Tip>
        </div>
    );
}
