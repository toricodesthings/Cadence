import { useState, type CSSProperties } from "react";
import { EmptyState } from "../tasks/EmptyState";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, ChevronDown, Clock } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { nextOpenTime, routineTimeOn, timeMarksOn, timeProgress } from "@cadence/domain/repeats";
import { wallTimeOf } from "@cadence/domain/time";
import { formatWallTime } from "../../lib/utils/date-format";
import { routineTone } from "../../lib/utils/habits";
import { getUserZone } from "../../lib/utils/user-zone";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { AgendaRow } from "./AgendaRow";
import { RoutineMark } from "../habits/RoutineMark";
import { stepProgress } from "../habits/RoutineSteps";
import { PendingMark } from "./PendingMark";

export function RoutineAgendaRow({
    id,
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
    id?: string;
    title: string;
    tone?: string;
    emoji?: string | null;
    timeLabel?: string | null;
    dateLabel?: string | null;
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
            leading={
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
                            <Clock className="h-3 w-3 animate-pulse" aria-hidden="true" />
                        ) : (
                            <RoutineMark emoji={emoji} size={12} className="opacity-90" />
                        )}
                    </span>
                </button>
            }
            onOpen={onOpen}
            ariaLabel={`Open routine ${title}`}
            className="items-center rounded-[28px] px-1.5 py-1.5 hover:bg-moonlit/[0.05]"
        >
            <div className="flex min-w-0 items-baseline gap-3">
                <span
                    className={`min-w-0 flex-1 truncate text-[15px] leading-snug ${done ? "text-twilight-text-muted line-through decoration-twilight-text-muted/60" : "text-twilight-text"}`}
                >
                    {title}
                    <PendingMark id={id} />
                </span>
                {meta ? (
                    <span className="shrink-0 text-[12px] tabular-nums text-twilight-text-soft">{meta}</span>
                ) : null}
            </div>
        </AgendaRow>
    );
}

export interface RoutineAgendaItem {
    habitId: string;
    title: string;
    emoji: string | null;
    tone: string;
    time: string | null;
    done: boolean;
    progress: string | null;
    timed: boolean;
}

export function routineAgendaItems(habits: Habit[], day: string): RoutineAgendaItem[] {
    return habits
        .flatMap((habit) => {
            const log = habit.logs?.find((entry) => entry.targetDate === day);
            if (!log || log.status === "SKIPPED") return [];
            const base = {
                habitId: habit.id,
                title: habit.title,
                emoji: habit.emoji ?? null,
                tone: routineTone(habit.colorAccent),
                done: log.status === "COMPLETED",
            };
            if (!habit.times?.length)
                return [{ ...base, time: routineTimeOn(habit, day), progress: stepProgress(habit, log), timed: false }];
            const marks = timeMarksOn(habit.times, log);
            const { done, total } = timeProgress(habit.times, marks);
            return [
                {
                    ...base,
                    time:
                        nextOpenTime(habit.times, marks, wallTimeOf(new Date(), getUserZone())) ?? habit.times.at(-1)!,
                    progress: `${done} of ${total} done`,
                    timed: true,
                },
            ];
        })
        .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title));
}

export function RoutineAgendaList({
    items,
    animate = false,
    columns = false,
    onOpen,
    onComplete,
}: {
    items: RoutineAgendaItem[];
    animate?: boolean;
    columns?: boolean;
    onOpen: (habitId: string) => void;
    onComplete: (item: RoutineAgendaItem) => void | Promise<unknown>;
}) {
    const [showDone, setShowDone] = useState(false);
    const reducedMotion = useReducedMotionSetting();
    const fold = animate && !reducedMotion;
    const rowsClass = columns
        ? "grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-2 gap-y-0.5"
        : "flex flex-col gap-0.5";
    const open = items.filter((item) => !item.done);
    const done = items.filter((item) => item.done);
    const row = (item: RoutineAgendaItem) => (
        <RoutineAgendaRow
            key={item.habitId}
            id={item.habitId}
            title={item.title}
            emoji={item.emoji}
            tone={item.tone}
            done={item.done}
            progress={item.progress}
            timeLabel={item.time ? (item.timed && !item.done ? "Next at " : "") + formatWallTime(item.time) : null}
            onOpen={() => onOpen(item.habitId)}
            onComplete={() => onComplete(item)}
        />
    );

    return (
        <div className="flex flex-col">
            {open.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="All done for today." description={null} compact />
            ) : (
                <div className={rowsClass}>
                    <AnimatePresence initial={false}>
                        {open.map((item) =>
                            fold ? (
                                <motion.div
                                    key={item.habitId}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                                    className="overflow-hidden"
                                >
                                    {row(item)}
                                </motion.div>
                            ) : (
                                row(item)
                            ),
                        )}
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
                        <ChevronDown
                            size={14}
                            aria-hidden="true"
                            className={`transition-transform ${showDone ? "rotate-180" : ""}`}
                        />
                        {done.length} done
                    </button>
                    {showDone ? <div className={rowsClass}>{done.map(row)}</div> : null}
                </>
            ) : null}
        </div>
    );
}
