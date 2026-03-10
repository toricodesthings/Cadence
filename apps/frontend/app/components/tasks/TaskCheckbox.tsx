import { useUpdateTask } from "../../hooks/tasks";
import { useTaskCompletionStore } from "../../stores/task-completion-store";
import type { Task, TaskState } from "../../types/task";
import { Pause } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface TaskCheckboxProps {
    task: Task;
    compact?: boolean;
}

/** Circular checkbox that toggles task between states */
export function TaskCheckbox({ task, compact = false }: TaskCheckboxProps) {
    const updateTask = useUpdateTask();
    const isComplete = task.state === "COMPLETE";
    const isWaiting = task.state === "WAITING";
    const pendingCompletion = useTaskCompletionStore((state) => state.pendingById[task.id]);
    const queueCompletion = useTaskCompletionStore((state) => state.queueCompletion);
    const cancelCompletion = useTaskCompletionStore((state) => state.cancelCompletion);
    const clearCompletion = useTaskCompletionStore((state) => state.clearCompletion);
    const [now, setNow] = useState(() => Date.now());

    const isPendingComplete = Boolean(pendingCompletion);
    const showsConfirmedState = isComplete || isPendingComplete;

    useEffect(() => {
        if (!pendingCompletion) return;

        const intervalId = window.setInterval(() => {
            setNow(Date.now());
        }, 100);

        return () => window.clearInterval(intervalId);
    }, [pendingCompletion]);

    useEffect(() => {
        if (task.state === "COMPLETE" && pendingCompletion) {
            clearCompletion(task.id);
        }
    }, [clearCompletion, pendingCompletion, task.id, task.state]);

    const countdownProgress = pendingCompletion
        ? Math.max(0, Math.min(1, (pendingCompletion.commitAt - now) / pendingCompletion.durationMs))
        : 0;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent card expansion click

        if (isPendingComplete) {
            cancelCompletion(task.id);
            return;
        }

        let nextState: TaskState = "COMPLETE";

        if (isComplete) {
            updateTask.mutate({
                id: task.id,
                state: "ACTIVE",
            });
            return;
        }

        if (isWaiting) nextState = "COMPLETE";
        else nextState = "COMPLETE";

        queueCompletion({
            taskId: task.id,
            taskTitle: task.title,
            onCommit: () => {
                updateTask.mutate({
                    id: task.id,
                    state: nextState,
                });
            },
        });
    };

    return (
        <button
            onClick={handleToggle}
            type="button"
            data-no-dnd="true"
            className={`group relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 cursor-pointer ${compact ? "h-8 w-8" : "mt-0.5 h-11 w-11 lg:h-8 lg:w-8"}`}
            aria-label={
                isComplete
                    ? "Mark incomplete"
                    : isPendingComplete
                        ? "Undo complete"
                        : isWaiting
                            ? "Finish waiting"
                            : "Mark complete"
            }
        >
            <AnimatePresence>
                {isPendingComplete && (
                    <motion.span
                        key="countdown-halo"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className={`absolute rounded-full border border-lantern/20 bg-lantern/[0.035] ${compact ? "inset-[3px]" : "inset-[5px] lg:inset-[3px]"}`}
                        style={{
                            boxShadow: `0 0 ${4 + countdownProgress * 6}px rgba(232, 164, 74, ${0.08 + countdownProgress * 0.08})`,
                        }}
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            <motion.span
                animate={
                    showsConfirmedState
                        ? {
                            scale: [0.88, 1.06, 1],
                            boxShadow: [
                                "0 0 0 rgba(232,164,74,0)",
                                "0 0 18px rgba(232,164,74,0.22)",
                                "0 0 0 rgba(232,164,74,0)",
                            ],
                        }
                        : { scale: 1, boxShadow: "0 0 0 rgba(232,164,74,0)" }
                }
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className={`relative z-10 flex items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-200 ${compact ? "h-6 w-6" : "h-8 w-8 lg:h-6 lg:w-6"} ${showsConfirmedState
                    ? "bg-lantern/20 border-lantern text-lantern"
                    : isWaiting
                        ? "border-moonlit/80 text-moonlit/80 group-hover:border-moonlit"
                        : "border-twilight-text-muted/70 group-hover:border-lantern/50"
                    }`}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {showsConfirmedState ? (
                        <motion.svg
                            key="check"
                            width="12"
                            height="12"
                            viewBox="0 0 10 10"
                            fill="none"
                            className="text-lantern"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <motion.path
                                d="M2 5L4 7L8 3"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            />
                        </motion.svg>
                    ) : isWaiting ? (
                        <motion.div
                            key="pause"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.18 }}
                        >
                            <Pause className="h-3 w-3" />
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </motion.span>
        </button>
    );
}
