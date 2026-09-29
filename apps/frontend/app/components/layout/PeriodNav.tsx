import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Tip } from "../primitives/Tooltip";

const ARROW = "btn-icon cursor-pointer rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text";

/** Jumps back to the period holding today; greyed out while you're already there. `compact` is the tablet header's small pill. */
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

/** Phone: a floating Today pill, bottom left (the add orb owns bottom right), shown only while you're away from today. */
export function PeriodTodayPill({ show, reducedMotion, onToday }: { show: boolean; reducedMotion: boolean; onToday: () => void }) {
    const hidden = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 };
    return (
        <AnimatePresence>
            {show ? (
                <motion.div
                    key="back-to-today"
                    initial={hidden}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={hidden}
                    transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                    className="layer-floating-bar mobile-floating-action fixed bottom-5 left-4"
                >
                    <button
                        type="button"
                        onClick={onToday}
                        className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-twilight-border/60 bg-panel-raised/90 px-4 text-sm font-medium text-twilight-text shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <CalendarCheck size={16} className="text-accent-primary" aria-hidden="true" />
                        Today
                    </button>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
