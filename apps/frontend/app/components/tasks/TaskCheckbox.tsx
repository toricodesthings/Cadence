import { useUpdateTask } from "../../hooks/tasks";
import { useUpdateSubtask } from "../../hooks/tasks/use-subtasks";
import { useTaskCompletionStore } from "../../stores/task-completion-store";
import { useSettings } from "../../hooks/core/use-settings";
import type { Task, TaskState, Subtask } from "../../types/task";
import { CalendarClock, Pause } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { supportsManualTaskCompletion } from "../../lib/utils/task/task-scheduling";

interface TaskCheckboxProps {
    task?: Task;
    subtask?: Subtask;
    compact?: boolean;
}

/** Circular checkbox that toggles task between states */
export function TaskCheckbox({ task, subtask, compact = false }: TaskCheckboxProps) {
    const updateTask = useUpdateTask();
    const updateSubtask = useUpdateSubtask(subtask?.taskId ?? "");
    const { data: userSettings } = useSettings();
    const showCelebration = userSettings?.tasks?.showDoneCelebration ?? true;
    const id = task?.id ?? subtask?.id ?? "";
    const title = task?.title ?? subtask?.title ?? "";
    const [sparkleKey, setSparkleKey] = useState(0);
    const allowsManualCompletion = task ? supportsManualTaskCompletion(task) : true;

    const isComplete = task ? task.state === "COMPLETE" : subtask?.isComplete;
    const isWaiting = task ? task.state === "WAITING" : false;
    const pendingCompletion = useTaskCompletionStore((state) => state.pendingById[id]);
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
        if (isComplete && pendingCompletion) {
            clearCompletion(id);
        }
    }, [clearCompletion, pendingCompletion, id, isComplete]);

    const countdownProgress = pendingCompletion
        ? Math.max(0, Math.min(1, (pendingCompletion.commitAt - now) / pendingCompletion.durationMs))
        : 0;

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (subtask) return; // Only main tasks have WAITING state
        if (!task || !allowsManualCompletion) return;

        if (isPendingComplete) {
            cancelCompletion(id);
        }

        // Toggle between WAITING and ACTIVE
        const targetState = isWaiting ? "ACTIVE" : "WAITING";
        updateTask.mutate({ id, state: targetState });
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent card expansion click
        if (task && !allowsManualCompletion) {
            return;
        }

        if (isPendingComplete) {
            cancelCompletion(id);
            return;
        }

        if (isComplete) {
            if (task) {
                updateTask.mutate({ id, state: "ACTIVE" });
            } else if (subtask) {
                updateSubtask.mutate({ id, isComplete: false });
            }
            return;
        }

        const commitCompletion = () => {
            if (task) {
                updateTask.mutate({ id, state: "COMPLETE" });
            } else if (subtask) {
                updateSubtask.mutate({ id, isComplete: true });
            }
        };

        queueCompletion({
            taskId: id,
            onCommit: commitCompletion,
        });

        if (showCelebration) {
            setSparkleKey((k) => k + 1);
        }
    };

    return (
        <button
            onClick={handleToggle}
            type="button"
            data-no-dnd="true"
            disabled={task ? !allowsManualCompletion : false}
            className={`group relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                task && !allowsManualCompletion ? "cursor-default" : "cursor-pointer"
            } ${compact ? "h-8 w-8" : "mt-0.5 h-11 w-11 lg:h-8 lg:w-8"}`}
            aria-label={
                task && !allowsManualCompletion
                    ? `${title} is a timetable anchor`
                    : isComplete
                        ? "Mark incomplete"
                        : isPendingComplete
                            ? "Undo complete"
                            : isWaiting
                                ? "Finish waiting"
                                : "Mark complete"
            }
        >
            {task && !allowsManualCompletion ? (
                <span
                    className={`relative z-10 flex items-center justify-center rounded-full border border-moonlit/35 bg-moonlit/10 text-moonlit ${
                        compact ? "h-6 w-6" : "h-8 w-8 lg:h-6 lg:w-6"
                    }`}
                    aria-hidden="true"
                >
                    <CalendarClock className="h-3 w-3" />
                </span>
            ) : (
                <>
            <AnimatePresence>
                {isPendingComplete && (
                    <motion.span
                        key="countdown-halo"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className={`absolute rounded-full border border-accent-primary/20 bg-accent-primary/[0.035] ${compact ? "inset-[3px]" : "inset-[5px] lg:inset-[3px]"}`}
                        style={{
                            boxShadow: `0 0 ${4 + countdownProgress * 6}px color-mix(in srgb, var(--accent-primary) ${Math.round((0.08 + countdownProgress * 0.08) * 100)}%, transparent)`,
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
                                "0 0 0 color-mix(in srgb, var(--accent-primary) 0%, transparent)",
                                "0 0 18px color-mix(in srgb, var(--accent-primary) 22%, transparent)",
                                "0 0 0 color-mix(in srgb, var(--accent-primary) 0%, transparent)",
                            ],
                        }
                        : { scale: 1, boxShadow: "0 0 0 color-mix(in srgb, var(--accent-primary) 0%, transparent)" }
                }
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className={`relative z-10 flex items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-200 ${compact ? "h-6 w-6" : "h-8 w-8 lg:h-6 lg:w-6"} ${showsConfirmedState
                    ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                    : isWaiting
                        ? "border-moonlit/80 text-moonlit/80 group-hover:border-moonlit"
                        : "border-twilight-text-muted/70 group-hover:border-accent-primary/50"
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
                            className="text-accent-primary"
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

            {/* Celebration sparkle burst */}
            <AnimatePresence>
                {sparkleKey > 0 && (
                    <CelebrationBurst key={sparkleKey} compact={compact} />
                )}
            </AnimatePresence>
                </>
            )}
        </button>
    );
}

const SPARKLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function CelebrationBurst({ compact }: { compact: boolean }) {
    const radius = compact ? 14 : 18;
    return (
        <>
            {SPARKLE_ANGLES.map((angle) => {
                const rad = (angle * Math.PI) / 180;
                const tx = Math.cos(rad) * radius;
                const ty = Math.sin(rad) * radius;
                return (
                    <motion.span
                        key={angle}
                        className="absolute rounded-full bg-accent-primary"
                        style={{ width: 3, height: 3 }}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                        animate={{ opacity: 0, x: tx, y: ty, scale: 0.4 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        aria-hidden="true"
                    />
                );
            })}
        </>
    );
}
