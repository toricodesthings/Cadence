import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, ChevronDown, Check, X, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router";
import { useHabitsWeekly } from "../../hooks/habits/use-habits";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import { toISODate } from "../../lib/utils/date-format";
import type { Habit, HabitLog } from "@cadence/contracts/habit";

interface TodayHabitRowProps {
    habit: Habit;
    log: HabitLog | undefined;
    todayIso: string;
}

function TodayHabitRow({ habit, log, todayIso }: TodayHabitRowProps) {
    const { mutate: resolve } = useResolveHabit(habit.id);
    const isCompleted = log?.status === "COMPLETED";
    const isSkipped = log?.status === "SKIPPED";

    return (
        <div className="flex items-center gap-3 group py-1.5">
            {/* Status toggle button */}
            <button
                onClick={() => resolve({
                    targetDate: log?.targetDate ?? todayIso,
                    status: isCompleted ? "PENDING" : "COMPLETED",
                })}
                aria-label={isCompleted ? "Mark habit pending" : "Complete habit"}
                className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-all duration-200 border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary ${isCompleted
                        ? "bg-accent-primary/20 border-accent-primary/50 shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_20%,transparent)]"
                        : isSkipped
                            ? "bg-twilight-surface border-twilight-border opacity-40"
                            : "bg-twilight-surface border-twilight-border hover:border-accent-primary/40 hover:bg-accent-primary/5"
                    }`}
            >
                <AnimatePresence mode="wait">
                    {isCompleted && (
                        <motion.span
                            key="check"
                            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        >
                            <Check size={11} className="text-accent-primary" strokeWidth={3} />
                        </motion.span>
                    )}
                    {isSkipped && (
                        <motion.span
                            key="skip"
                            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        >
                            <X size={10} className="text-twilight-text-muted" />
                        </motion.span>
                    )}
                </AnimatePresence>
            </button>

            {/* Title */}
            <span className={`text-sm flex-1 truncate transition-colors ${isCompleted
                    ? "line-through text-twilight-text-muted"
                    : isSkipped
                        ? "text-twilight-text-muted/50"
                        : "text-twilight-text-soft group-hover:text-twilight-text"
                }`}>
                {habit.title}
            </span>

            {/* Skip button (on hover) */}
            {!isCompleted && !isSkipped && (
                <button
                    onClick={() => resolve({
                        targetDate: log?.targetDate ?? todayIso,
                        status: "SKIPPED",
                    })}
                    aria-label="Skip habit"
                    className="opacity-0 group-hover:opacity-100 touch-reveal transition-opacity p-1 rounded text-twilight-text-muted/50 hover:text-twilight-text-muted text-[10px] uppercase tracking-widest font-medium"
                >
                    skip
                </button>
            )}
        </div>
    );
}

interface PlannerHabitsSectionProps {
    selectedDate: string; // YYYY-MM-DD
}

/** Collapsible habits section for the Planner page */
export function PlannerHabitsSection({ selectedDate }: PlannerHabitsSectionProps) {
    const [open, setOpen] = useState(true);
    const { data: habits = [], isLoading } = useHabitsWeekly({
        start: selectedDate,
        end: selectedDate,
    });

    // Filter habits that are scheduled today (have a log for today)
    const todayHabits = habits.filter((h) =>
        h.logs?.some((l) => l.targetDate.substring(0, 10) === selectedDate)
    );

    if (!isLoading && todayHabits.length === 0) return null;

    const completedCount = todayHabits.filter((h) =>
        h.logs?.find((l) => l.targetDate.substring(0, 10) === selectedDate)?.status === "COMPLETED"
    ).length;

    return (
        <div className="mt-6">
            {/* Section header */}
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left group mb-2 focus-visible:outline-none"
                aria-expanded={open}
            >
                <div className="flex items-center gap-2 flex-1">
                    <Flame size={13} className="text-accent-primary/70" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-twilight-text-muted group-hover:text-twilight-text-soft transition-colors">
                        Habits
                    </span>
                    {isLoading ? null : (
                        <span className="text-[10px] text-twilight-text-muted/60 font-medium tabular-nums">
                            {completedCount}/{todayHabits.length}
                        </span>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: open ? 0 : -90 }}
                    transition={{ duration: 0.18 }}
                >
                    <ChevronDown size={13} className="text-twilight-text-muted/50" />
                </motion.div>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col border border-twilight-border/30 rounded-2xl bg-twilight-surface/30 px-4 py-2 divide-y divide-twilight-border/20">
                            {isLoading ? (
                                <div className="py-3 flex flex-col gap-2">
                                    <div className="h-4 w-2/3 rounded-full bg-white/[0.04] animate-pulse" />
                                    <div className="h-4 w-1/2 rounded-full bg-white/[0.04] animate-pulse" />
                                </div>
                            ) : (
                                todayHabits.map((habit) => {
                                    const log = habit.logs?.find(
                                        (l) => l.targetDate.substring(0, 10) === selectedDate
                                    );
                                    return (
                                        <TodayHabitRow
                                            key={habit.id}
                                            habit={habit}
                                            log={log}
                                            todayIso={selectedDate}
                                        />
                                    );
                                })
                            )}
                            {/* Footer link to habits page */}
                            <Link
                                to="/habits"
                                className="flex items-center gap-1.5 pt-2 pb-1 text-[11px] text-twilight-text-muted/50 hover:text-accent-primary/70 transition-colors"
                            >
                                <LinkIcon size={10} />
                                View all habits
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
