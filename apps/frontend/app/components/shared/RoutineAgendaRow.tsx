import { useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Clock3 } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { routineTimeOn } from "@cadence/domain/repeats";
import { formatTime } from "../../lib/utils/date-format";
import { routineTone } from "../../lib/utils/habits";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { AgendaRow } from "./AgendaRow";
import { RoutineMark } from "../habits/RoutineMark";
import { stepProgress } from "../habits/RoutineSteps";

/**
 * One routine in an agenda: its mark, its title, and a time only when it has
 * one. The surrounding section already says "routine" and which day it is, so
 * the row doesn't repeat either. Today's tray and Upcoming share it.
 */
export function RoutineAgendaRow({
    title,
    emoji = null,
    timeLabel = null,
    dateLabel = null,
    progress = null,
    done = false,
    tone,
    onOpen,
    onComplete,
}: {
    title: string;
    /** The routine's colour (`routineTone`); moonlit when absent. */
    tone?: string;
    emoji?: string | null;
    timeLabel?: string | null;
    /** Only for lists that span several days, e.g. "Sep 23". */
    dateLabel?: string | null;
    /** Steps settled so far on a partly done day, e.g. "2/3". */
    progress?: string | null;
    done?: boolean;
    onOpen: () => void;
    onComplete: () => void | Promise<unknown>;
}) {
    const [isResolving, setIsResolving] = useState(false);

    const handleResolve = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isResolving) return;
        setIsResolving(true);
        try {
            await onComplete();
        } finally {
            setIsResolving(false);
        }
    };

    const meta = [dateLabel, progress, timeLabel].filter(Boolean).join(" · ");

    return (
        <AgendaRow
            leading={(
                <button
                    type="button"
                    onClick={handleResolve}
                    data-no-dnd="true"
                    disabled={isResolving}
                    aria-label={done ? `Mark ${title} not done` : isResolving ? "Checking in" : `Check in ${title}`}
                    style={{ "--routine-tone": tone ?? "var(--color-moonlit)" } as CSSProperties}
                    className="group/check relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-200 ${
                            done
                                ? "border-transparent bg-[color-mix(in_srgb,var(--routine-tone)_80%,transparent)] text-[var(--primary-foreground)]"
                                : isResolving
                                    ? "border-accent-primary/60 bg-accent-primary/15 text-[var(--routine-tone)]"
                                    : "border-[color-mix(in_srgb,var(--routine-tone)_45%,transparent)] text-[var(--routine-tone)] group-hover/check:border-[color-mix(in_srgb,var(--routine-tone)_75%,transparent)]"
                        }`}
                    >
                        {done ? (
                            <Check size={15} strokeWidth={3} aria-hidden="true" />
                        ) : isResolving ? (
                            <Clock3 className="h-3 w-3 animate-pulse" aria-hidden="true" />
                        ) : (
                            <RoutineMark emoji={emoji} size={12} className="opacity-90" />
                        )}
                    </span>
                </button>
            )}
            onOpen={onOpen}
            ariaLabel={`Open routine ${title}`}
            className="items-center py-1.5 hover:bg-moonlit/[0.05]"
        >
            <div className="flex min-w-0 items-baseline gap-3">
                <span className={`min-w-0 flex-1 truncate text-[15px] leading-snug ${done ? "text-twilight-text-muted line-through decoration-twilight-text-muted/60" : "text-twilight-text"}`}>
                    {title}
                </span>
                {meta ? <span className="shrink-0 text-[12px] tabular-nums text-twilight-text-soft">{meta}</span> : null}
            </div>
        </AgendaRow>
    );
}

export interface RoutineAgendaItem {
    habitId: string;
    title: string;
    emoji: string | null;
    tone: string;
    /** "HH:mm" on that day, when the routine has one. */
    time: string | null;
    done: boolean;
    /** "2/3" while a routine with steps is partly done. */
    progress: string | null;
}

/** The routines due on `day` (skipped ones left out), timed first. */
export function routineAgendaItems(habits: Habit[], day: string): RoutineAgendaItem[] {
    return habits
        .flatMap((habit) => {
            const log = habit.logs?.find((entry) => entry.targetDate.slice(0, 10) === day);
            if (!log || log.status === "SKIPPED") return [];
            return [{ habitId: habit.id, title: habit.title, emoji: habit.emoji ?? null, tone: routineTone(habit.colorAccent), time: routineTimeOn(habit, day), done: log.status === "COMPLETED", progress: stepProgress(habit, log) }];
        })
        .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title));
}

/**
 * Open routines as one-tap rows, done ones folded under "N done". Today's tray
 * and the Routines page share it. `animate`: a checked row folds away instead
 * of vanishing (off under reduced motion).
 */
export function RoutineAgendaList({ items, day, animate = false, columns = false, onOpen, onComplete }: {
    items: RoutineAgendaItem[];
    day: string;
    animate?: boolean;
    /** Wide screens: rows side by side, so a full-width band keeps each time next to its title. */
    columns?: boolean;
    onOpen: (habitId: string) => void;
    onComplete: (item: RoutineAgendaItem) => void | Promise<unknown>;
}) {
    const [showDone, setShowDone] = useState(false);
    const reducedMotion = useReducedMotionSetting();
    const fold = animate && !reducedMotion;
    const rowsClass = columns ? "grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-2 gap-y-0.5" : "flex flex-col gap-0.5";
    const open = items.filter((item) => !item.done);
    const done = items.filter((item) => item.done);
    const row = (item: RoutineAgendaItem) => (
        <RoutineAgendaRow
            key={item.habitId}
            title={item.title}
            emoji={item.emoji}
            tone={item.tone}
            done={item.done}
            progress={item.progress}
            timeLabel={item.time ? formatTime(`${day}T${item.time}:00`) : null}
            onOpen={() => onOpen(item.habitId)}
            onComplete={() => onComplete(item)}
        />
    );

    return (
        <div className="flex flex-col">
            {open.length === 0 ? (
                <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/90">All done for today.</div>
            ) : (
                <div className={rowsClass}>
                    <AnimatePresence initial={false}>
                        {open.map((item) => fold ? (
                            <motion.div key={item.habitId} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: EASE_OUT_EXPO }} className="overflow-hidden">
                                {row(item)}
                            </motion.div>
                        ) : row(item))}
                    </AnimatePresence>
                </div>
            )}
            {done.length > 0 ? (
                <>
                    <button
                        type="button"
                        onClick={() => setShowDone((value) => !value)}
                        aria-expanded={showDone}
                        className="mx-2 mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-2xl px-3 text-[13px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${showDone ? "rotate-180" : ""}`} />
                        {done.length} done
                    </button>
                    {showDone ? <div className={rowsClass}>{done.map(row)}</div> : null}
                </>
            ) : null}
        </div>
    );
}
