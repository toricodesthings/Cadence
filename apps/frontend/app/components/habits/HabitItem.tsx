import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import type { Habit, HabitLog } from "../../types/habit";
import { useState } from "react";
import * as Popover from "../primitives/Popover";

interface HabitItemProps {
    habit: Habit;
    log: HabitLog;
    targetDate: string; // ISO strictly pointing to this block
}

export function HabitItem({ habit, log, targetDate }: HabitItemProps) {
    const { mutate: resolveHabit } = useResolveHabit(habit.id);
    const [open, setOpen] = useState(false);

    const isCompleted = log.status === "COMPLETED";
    const isSkipped = log.status === "SKIPPED";
    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Instant optimistic toggle between PENDING and COMPLETED
        resolveHabit({
            targetDate: log.targetDate, // full iso
            status: isCompleted ? "PENDING" : "COMPLETED"
        });
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    data-focus-kind="habit"
                    data-focus-id={habit.id}
                    onClick={handleToggle}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        setOpen(true);
                    }}
                    aria-label={`${habit.title} on ${targetDate}: ${isCompleted ? "completed" : isSkipped ? "skipped" : "pending"}`}
                    className={`touch-target relative flex h-11 w-11 items-center justify-center auto-rounded shadow-sm transition-all duration-300 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lantern focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-void ${isCompleted
                            ? 'bg-lantern/20 border border-lantern shadow-lantern hover:shadow-[0_0_20px_rgba(235,123,89,0.4)]'
                            : isSkipped
                                ? 'bg-twilight-void/50 border border-twilight-border opacity-50'
                                : 'bg-twilight-surface hover:bg-twilight-surface-hover border border-twilight-border-light hover:border-twilight-border shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]'
                        } ${isCompleted ? 'rounded-md' : 'rounded-full'}`}
                >
                    <AnimatePresence mode="popLayout">
                        {isCompleted && (
                            <motion.div
                                key="check"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <Check className="h-5 w-5 text-lantern drop-shadow-md" strokeWidth={3} />
                            </motion.div>
                        )}
                        {isSkipped && (
                            <motion.div
                                key="close"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <X className="h-4 w-4 text-twilight-text-soft" strokeWidth={2} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </button>
            </Popover.Trigger>

            <Popover.Content sideOffset={8} className="p-2 flex space-x-2">
                <button
                    className="touch-target rounded-xl bg-twilight-surface-hover/50 p-3 text-lantern shadow-inner transition-colors hover:bg-twilight-surface-hover"
                    onClick={() => {
                        resolveHabit({ targetDate: log.targetDate, status: "COMPLETED" });
                        setOpen(false);
                    }}
                    aria-label="Mark habit complete"
                >
                    <Check className="h-5 w-5" />
                </button>
                <button
                    className="touch-target rounded-xl bg-twilight-surface-hover/50 p-3 text-twilight-text-soft transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text"
                    onClick={() => {
                        resolveHabit({ targetDate: log.targetDate, status: "SKIPPED" });
                        setOpen(false);
                    }}
                    aria-label="Skip habit"
                >
                    <X className="h-5 w-5" />
                </button>
                <div className="w-px bg-twilight-border mx-1 my-2" />
                <button
                    className="touch-target rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-widest text-twilight-text-soft transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text"
                    onClick={() => {
                        resolveHabit({ targetDate: log.targetDate, status: "PENDING" });
                        setOpen(false);
                    }}
                >
                    Clear
                </button>
            </Popover.Content>
        </Popover.Root>
    );
}
