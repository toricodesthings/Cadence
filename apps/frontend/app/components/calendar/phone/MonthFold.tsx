import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Task } from "@cadence/contracts/task";
import { getDaysInMonth, getFirstDayOfWeek, MONTH_NAMES, parseLocalDate, toISODate, weekdayLabels } from "../../../lib/utils/date-format";
import { dayLoad, scheduleKind, splitDay } from "../../../lib/utils/calendar/schedule-day";
import { loadWord } from "../../../lib/utils/task/day-load";
import { ScheduleRow, type ScheduleRowHandlers } from "./ScheduleRow";

const WEEKDAYS = weekdayLabels(1);
/** Scrolling the list this far folds the month into the selected week. */
const FOLD_AT = 12;
/** Pulling down this far at the top of the list unfolds it. */
const UNFOLD_PULL = 48;

export interface MonthFoldProps extends ScheduleRowHandlers {
    year: number;
    month: number;
    selectedIso: string;
    /** Everything scheduled this month, routines included, by ISO day. */
    groups: Map<string, Task[]>;
    /** Holiday, birthday and personal-event names by ISO day. */
    markers: Map<string, string[]>;
    routineEmoji: (task: Task) => string | null;
    onSelect: (iso: string) => void;
    onOpenDay: (iso: string) => void;
    onNextMonth: () => void;
    dragActive?: boolean;
    reducedMotion?: boolean;
}

function isoOf(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Month on a phone: the grid navigates, the list below it is the content.
 * Scrolling the list folds the grid into the selected week; pulling down at
 * the top, or the handle, opens it again. Tap a day to start the list there;
 * tap it again (or its heading) to open the day.
 */
export function MonthFold({
    year,
    month,
    selectedIso,
    groups,
    markers,
    routineEmoji,
    onSelect,
    onOpenDay,
    onNextMonth,
    dragActive,
    reducedMotion,
    ...handlers
}: MonthFoldProps) {
    const todayIso = toISODate(new Date());
    const [folded, setFolded] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const pullStart = useRef<number | null>(null);

    const weeks = useMemo(() => {
        const cells: (string | null)[] = Array.from({ length: getFirstDayOfWeek(year, month) }, () => null);
        for (let day = 1; day <= getDaysInMonth(year, month); day++) cells.push(isoOf(year, month, day));
        while (cells.length % 7) cells.push(null);
        return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
    }, [month, year]);

    // The list starts at the selected day, so a new selection starts at its top.
    useEffect(() => {
        listRef.current?.scrollTo({ top: 0 });
    }, [selectedIso]);

    /** Selected day onward: days with something get a heading, quiet runs collapse to one line. */
    const agenda = useMemo(() => {
        const blocks: Array<{ kind: "day"; iso: string } | { kind: "open"; from: string; to: string }> = [];
        const selectedDay = parseLocalDate(selectedIso).getDate();
        for (let day = selectedDay; day <= getDaysInMonth(year, month); day++) {
            const iso = isoOf(year, month, day);
            const busy = (groups.get(iso)?.length ?? 0) > 0 || (markers.get(iso)?.length ?? 0) > 0;
            if (busy || iso === selectedIso) {
                blocks.push({ kind: "day", iso });
                continue;
            }
            const last = blocks[blocks.length - 1];
            if (last?.kind === "open") last.to = iso;
            else blocks.push({ kind: "open", from: iso, to: iso });
        }
        return blocks;
    }, [groups, markers, month, selectedIso, year]);

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        if (!folded && event.currentTarget.scrollTop > FOLD_AT) setFolded(true);
    };

    const handleTouchStart = (event: React.TouchEvent) => {
        pullStart.current = (listRef.current?.scrollTop ?? 0) <= 0 ? event.touches[0].clientY : null;
    };

    const handleTouchMove = (event: React.TouchEvent) => {
        if (!folded || pullStart.current === null) return;
        if (event.touches[0].clientY - pullStart.current > UNFOLD_PULL) {
            pullStart.current = null;
            setFolded(false);
        }
    };

    const handleWheel = (event: React.WheelEvent) => {
        if (folded && event.deltaY < -20 && (listRef.current?.scrollTop ?? 0) <= 0) setFolded(false);
    };

    const handleCell = (iso: string) => {
        if (iso === selectedIso) onOpenDay(iso);
        else onSelect(iso);
    };

    const rowTransition = reducedMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 40 };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 px-3 pt-1">
                <div className="grid grid-cols-7" aria-hidden="true">
                    {WEEKDAYS.map((label, i) => (
                        <span key={i} className="py-1 text-center text-[10px] font-semibold uppercase text-twilight-text-muted">{label}</span>
                    ))}
                </div>
                <div role="grid" aria-label={`${MONTH_NAMES[month]} ${year}`}>
                    <AnimatePresence initial={false}>
                        {weeks.map((week) => {
                            const visible = !folded || week.includes(selectedIso);
                            if (!visible) return null;
                            return (
                                <motion.div
                                    key={week.find(Boolean)}
                                    role="row"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={rowTransition}
                                    className="grid grid-cols-7 overflow-hidden"
                                >
                                    {week.map((iso, i) => {
                                        if (!iso) return <span key={i} role="gridcell" />;
                                        const items = groups.get(iso) ?? [];
                                        const kinds = new Set(items.filter((t) => t.state !== "COMPLETE").map(scheduleKind));
                                        const marked = (markers.get(iso)?.length ?? 0) > 0;
                                        const selected = iso === selectedIso;
                                        const isToday = iso === todayIso;
                                        const date = parseLocalDate(iso);
                                        return (
                                            <span key={iso} role="gridcell" aria-selected={selected}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCell(iso)}
                                                    aria-label={`${format(date, "EEEE d MMMM")}${isToday ? ", today" : ""}${items.length ? `, ${loadWord(dayLoad(items))}` : ", open"}${marked ? `, ${markers.get(iso)!.join(", ")}` : ""}${selected ? ". Tap again to open the day" : ""}`}
                                                    className="flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 rounded-xl"
                                                >
                                                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] tabular-nums transition-colors ${
                                                        selected
                                                            ? "bg-accent-primary font-semibold text-twilight-void"
                                                            : isToday
                                                                ? "font-semibold text-accent-primary ring-1 ring-accent-primary/60"
                                                                : "text-twilight-text"
                                                    }`}>
                                                        {date.getDate()}
                                                    </span>
                                                    <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                                                        {kinds.has("task") ? <span className="h-1.5 w-1.5 rounded-full bg-accent-primary/80" /> : null}
                                                        {kinds.has("fixed") ? <span className="h-1.5 w-1.5 rounded-full bg-moonlit/80" /> : null}
                                                        {kinds.has("routine") ? <span className="h-1.5 w-1.5 rounded-full border border-moonlit/70" /> : null}
                                                        {marked ? <span className="h-1.5 w-1.5 rounded-full bg-solstice" /> : null}
                                                    </span>
                                                </button>
                                            </span>
                                        );
                                    })}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
                <button
                    type="button"
                    onClick={() => setFolded((value) => !value)}
                    aria-expanded={!folded}
                    aria-label={folded ? "Show the whole month" : "Fold the month into this week"}
                    className="mx-auto flex h-6 w-16 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    {folded
                        ? <ChevronDown size={16} className="text-twilight-text-soft" aria-hidden="true" />
                        : <span className="h-1 w-9 rounded-full bg-twilight-text-soft/35" aria-hidden="true" />}
                </button>
            </div>

            <div
                ref={listRef}
                onScroll={handleScroll}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onWheel={handleWheel}
                className="touch-scroll-y min-h-0 flex-1 border-t border-twilight-border/40 px-3 pb-36"
            >
                {agenda.map((block) => {
                    if (block.kind === "open") {
                        const from = parseLocalDate(block.from);
                        const label = block.from === block.to
                            ? format(from, "EEE d")
                            : `${format(from, "EEE d")} – ${format(parseLocalDate(block.to), "EEE d")}`;
                        return (
                            <button
                                key={block.from}
                                type="button"
                                onClick={() => onOpenDay(block.from)}
                                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-2xl px-2 text-left text-[13px] text-twilight-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <span className="text-twilight-text-soft">{label}</span>
                                <span aria-hidden="true">·</span>
                                <span>open</span>
                            </button>
                        );
                    }

                    const items = groups.get(block.iso) ?? [];
                    const { allDay, timed } = splitDay(items);
                    const date = parseLocalDate(block.iso);
                    const relation = block.iso === todayIso ? "Today" : null;
                    const dayMarkers = markers.get(block.iso) ?? [];
                    return (
                        <section key={block.iso} aria-label={format(date, "EEEE d MMMM")} className="pb-2">
                            <button
                                type="button"
                                onClick={() => onOpenDay(block.iso)}
                                className="group flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-2xl px-2 pt-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <span className={`font-display text-[15px] font-semibold ${relation ? "text-accent-primary" : "text-twilight-text"}`}>
                                    {format(date, "EEEE d")}
                                </span>
                                {relation ? <span className="text-[12px] text-accent-primary/90">{relation}</span> : null}
                                <span className="min-w-0 flex-1 truncate text-[12px] text-twilight-text-soft">
                                    {[items.length ? loadWord(dayLoad(items)) : null, ...dayMarkers].filter(Boolean).join(" · ")}
                                </span>
                                <ChevronRight size={15} className="shrink-0 text-twilight-text-muted transition-colors group-hover:text-twilight-text" aria-hidden="true" />
                            </button>
                            {items.length === 0 ? (
                                <p className="px-2 pb-2 text-[13px] text-twilight-text-muted">Nothing planned.</p>
                            ) : (
                                [...allDay, ...timed].map((task) => (
                                    <ScheduleRow
                                        key={task.id}
                                        task={task}
                                        routineEmoji={routineEmoji(task)}
                                        dragActive={dragActive}
                                        reducedMotion={reducedMotion}
                                        {...handlers}
                                    />
                                ))
                            )}
                        </section>
                    );
                })}
                <button
                    type="button"
                    onClick={onNextMonth}
                    className="mx-auto mt-4 flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    On to {MONTH_NAMES[(month + 1) % 12]}
                    <ChevronRight size={14} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
