import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import { format } from "date-fns";
import { toISODate } from "../../../lib/utils/date-format";
import { slideVariants, type SlideCustom } from "../../../lib/constants/motion";
import { loadDots } from "../../../lib/utils/calendar/schedule-day";
import { loadWord } from "../../../lib/utils/task/day-load";
import { usePeriodSwipe } from "../../../hooks/ui/use-period-swipe";

interface DayStripProps {
    weekDates: Date[];
    selectedIso: string;
    loads: Map<string, number>;
    /** Days with a holiday, birthday or personal event. */
    markedDays?: Set<string>;
    onSelect: (iso: string) => void;
    onShiftWeek: (delta: number) => void;
}

function StripDay({ date, selected, isToday, load, marked, onSelect }: {
    date: Date;
    selected: boolean;
    isToday: boolean;
    load: number;
    marked: boolean;
    onSelect: () => void;
}) {
    const iso = toISODate(date);
    // Long-pressing a task row and dropping it here moves it to this day.
    const { setNodeRef, isOver } = useDroppable({ id: `day-${iso}` });
    const dots = loadDots(load);
    return (
        <button
            ref={setNodeRef}
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={`${format(date, "EEEE d MMMM")}${isToday ? ", today" : ""}, ${loadWord(load)}${marked ? ", has an event" : ""}`}
            className={`relative flex min-h-[60px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                isOver
                    ? "bg-moonlit/20 ring-1 ring-moonlit/50"
                    : selected
                        ? "bg-accent-primary text-twilight-void"
                        : "hover:bg-white/[0.05]"
            }`}
        >
            <span className={`text-[10px] font-semibold uppercase ${selected ? "" : isToday ? "text-accent-primary" : "text-twilight-text-muted"}`}>
                {format(date, "EEEEE")}
            </span>
            <span className={`text-[17px] font-semibold leading-none tabular-nums ${selected ? "" : isToday ? "text-accent-primary" : "text-twilight-text"}`}>
                {date.getDate()}
            </span>
            <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                {Array.from({ length: dots }, (_, i) => (
                    <span key={i} className={`h-1 w-1 rounded-full ${selected ? "bg-twilight-void/60" : "bg-accent-primary/70"}`} />
                ))}
            </span>
            {marked ? (
                <span aria-hidden="true" className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${selected ? "bg-twilight-void/60" : "bg-solstice"}`} />
            ) : null}
        </button>
    );
}

/**
 * The week around the selected day. Tap a day to open it; swipe the strip to
 * change week (the day list below swipes day by day). Load reads as dots,
 * never counts.
 */
export function DayStrip({ weekDates, selectedIso, loads, markedDays, onSelect, onShiftWeek }: DayStripProps) {
    const todayIso = toISODate(new Date());
    const [direction, setDirection] = useState(0);
    const shift = (delta: number) => {
        setDirection(delta);
        onShiftWeek(delta);
    };
    const { reducedMotion, dragProps } = usePeriodSwipe({ enabled: true, onCommit: shift });
    const custom: SlideCustom = { direction, distance: reducedMotion ? 0 : 24 };
    const weekKey = weekDates[0] ? toISODate(weekDates[0]) : "";

    return (
        <motion.div {...dragProps} className="shrink-0 overflow-hidden px-3 pb-2 pt-1 select-none">
            <AnimatePresence initial={false} custom={custom} mode="popLayout">
                <motion.div
                    key={weekKey}
                    custom={custom}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={reducedMotion ? { duration: 0 } : { x: { type: "spring", stiffness: 380, damping: 34 }, opacity: { duration: 0.15 } }}
                    className="grid grid-cols-7 gap-1"
                    role="group"
                    aria-label="Week"
                >
                    {weekDates.map((date) => {
                        const iso = toISODate(date);
                        return (
                            <StripDay
                                key={iso}
                                date={date}
                                selected={iso === selectedIso}
                                isToday={iso === todayIso}
                                load={loads.get(iso) ?? 0}
                                marked={markedDays?.has(iso) ?? false}
                                onSelect={() => onSelect(iso)}
                            />
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </motion.div>
    );
}
