import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import type { Habit, HabitLog } from "../../types/habit";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

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
    const isPending = log.status === "PENDING";

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
                    onClick={handleToggle}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        setOpen(true);
                    }}
                    className={`h-10 w-10 relative flex items-center justify-center auto-rounded shadow-sm transition-all duration-300 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lantern focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-void ${isCompleted
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
                                <X className="h-4 w-4 text-twilight-content" strokeWidth={2} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </button>
            </Popover.Trigger>

            <AnimatePresence>
                {open && (
                    <Popover.Portal forceMount>
                        <Popover.Content sideOffset={8} className="z-50 outline-none" asChild>
                            <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }} // Natural UI curve
                                className="glass bg-twilight-surface p-2 rounded-xl border border-twilight-border shadow-2xl flex space-x-2 relative"
                            >
                                <button
                                    className="p-3 bg-twilight-surface-hover/50 hover:bg-twilight-surface-hover rounded-lg text-lantern shadow-inner transition-colors"
                                    onClick={() => {
                                        resolveHabit({ targetDate: log.targetDate, status: "COMPLETED" });
                                        setOpen(false);
                                    }}
                                >
                                    <Check className="h-5 w-5" />
                                </button>
                                <button
                                    className="p-3 bg-twilight-surface-hover/50 hover:bg-twilight-surface-hover rounded-lg text-twilight-content transition-colors"
                                    onClick={() => {
                                        resolveHabit({ targetDate: log.targetDate, status: "SKIPPED" });
                                        setOpen(false);
                                    }}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <div className="w-px bg-twilight-border mx-1 my-2" />
                                <button
                                    className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-twilight-surface-hover text-twilight-content transition-colors uppercase tracking-widest"
                                    onClick={() => {
                                        resolveHabit({ targetDate: log.targetDate, status: "PENDING" });
                                        setOpen(false);
                                    }}
                                >
                                    Clear
                                </button>
                            </motion.div>
                        </Popover.Content>
                    </Popover.Portal>
                )}
            </AnimatePresence>
        </Popover.Root>
    );
}
