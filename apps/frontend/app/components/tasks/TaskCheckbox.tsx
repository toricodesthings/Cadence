import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useUpdateSubtask } from "../../hooks/tasks/use-subtasks";
import { useTaskCompletionStore } from "../../stores/task-completion-store";
import { useSettings } from "../../hooks/core/use-settings";
import type { Subtask } from "@cadence/contracts/subtask";
import type { Task } from "@cadence/contracts/task";
import { CalendarClock, Pause } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supportsManualTaskCompletion } from "../../lib/utils/task/task-scheduling";
import { trackUsageEvent } from "../../lib/api/track-event";

interface TaskCheckboxProps {
    task?: Task;
    subtask?: Subtask;
    compact?: boolean;
}

/** What the box checks off: a task (a Fixed one can't be) or a subtask. */
function checkboxSubject(task: Task | undefined, subtask: Subtask | undefined) {
    if (task) {
        // A Fixed block passes on its own: no check-off.
        const fixed = !supportsManualTaskCompletion(task);
        return { id: task.id, title: task.title, fixed, isComplete: task.state === "COMPLETE", isWaiting: task.state === "WAITING" };
    }
    return { id: subtask?.id ?? "", title: subtask?.title ?? "", fixed: false, isComplete: subtask?.isComplete, isWaiting: false };
}

/** How much of the completion countdown is left, 1 → 0. */
function countdownOf(pending: { commitAt: number; durationMs: number } | undefined, now: number) {
    return pending ? Math.max(0, Math.min(1, (pending.commitAt - now) / pending.durationMs)) : 0;
}

type CheckboxLabelState = { fixed: boolean; title: string; isComplete: boolean | undefined; isPendingComplete: boolean; isWaiting: boolean };

function checkboxLabel({ fixed, title, isComplete, isPendingComplete, isWaiting }: CheckboxLabelState) {
    if (fixed) return `${title} is fixed, no check-off`;
    if (isComplete) return "Mark incomplete";
    if (isPendingComplete) return "Undo complete";
    return isWaiting ? "Finish waiting" : "Mark complete";
}

function FixedMark({ compact }: { compact: boolean }) {
    return (
        <span
            className={`relative z-10 flex items-center justify-center rounded-full border border-moonlit/35 bg-moonlit/10 text-moonlit ${
                compact ? "h-6 w-6" : "h-8 w-8 lg:h-6 lg:w-6"
            }`}
            aria-hidden="true"
        >
            <CalendarClock className="h-3 w-3" />
        </span>
    );
}

function markSize(small: boolean, compact: boolean) {
    if (small) return "h-5 w-5";
    return compact ? "h-6 w-6" : "h-8 w-8 lg:h-6 lg:w-6";
}

function markTone(confirmed: boolean, isWaiting: boolean) {
    if (confirmed) return "bg-accent-primary/20 border-accent-primary text-accent-primary";
    return isWaiting ? "border-moonlit/80 text-moonlit/80 group-hover:border-moonlit" : "border-twilight-text-muted/70 group-hover:border-accent-primary/50";
}

type CheckMarkProps = {
    compact: boolean;
    /** A subtask's smaller ring. */
    small: boolean;
    confirmed: boolean;
    isWaiting: boolean;
    isPendingComplete: boolean;
    countdownProgress: number;
    sparkleKey: number;
};

/** The ring: a countdown halo while completion waits, a check or pause inside, and the celebration burst. */
function CheckMark({ compact, small, confirmed, isWaiting, isPendingComplete, countdownProgress, sparkleKey }: CheckMarkProps) {
    return (
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
                    confirmed
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
                className={`relative z-10 flex items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-200 ${markSize(small, compact)} ${markTone(confirmed, isWaiting)}`}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {confirmed ? (
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
    );
}

/** Circular checkbox that toggles task between states */
export function TaskCheckbox({ task, subtask, compact = false }: TaskCheckboxProps) {
    const updateTask = useUpdateTask();
    const updateSubtask = useUpdateSubtask(subtask?.taskId ?? "");
    const { data: userSettings } = useSettings();
    const showCelebration = userSettings?.tasks?.showDoneCelebration ?? true;
    const { id, title, fixed, isComplete, isWaiting } = checkboxSubject(task, subtask);
    const [sparkleKey, setSparkleKey] = useState(0);
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

    const countdownProgress = countdownOf(pendingCompletion, now);

    const trackQuickAction = (outcome: string, inputMethod: "click" | "context_menu") => {
        if (!task) return;
        trackUsageEvent("task.quick_action_used", {
            object_type: "task",
            outcome,
            input_method: inputMethod,
            route: window.location.pathname,
            surface: "task_checkbox",
        });
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent card expansion click
        if (fixed) {
            return;
        }

        if (isPendingComplete) {
            trackQuickAction("cancel_pending_completion", "click");
            cancelCompletion(id);
            return;
        }

        if (isComplete) {
            if (task) {
                trackQuickAction("mark_incomplete", "click");
                updateTask.mutate({ id, state: "ACTIVE" });
            } else if (subtask) {
                updateSubtask.mutate({ id, isComplete: false });
            }
            return;
        }

        const commitCompletion = () => {
            if (task) {
                trackUsageEvent("task.complete", {
                    object_type: "task",
                    input_method: "click",
                    outcome: "completed",
                    route: window.location.pathname,
                    surface: "task_checkbox",
                });
                updateTask.mutate({ id, state: "COMPLETE" });
            } else if (subtask) {
                updateSubtask.mutate({ id, isComplete: true });
            }
        };

        trackQuickAction("queue_completion", "click");
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
            disabled={fixed}
            className={`group relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                fixed ? "cursor-default" : "cursor-pointer"
            } ${compact ? "h-8 w-8" : "mt-0.5 h-11 w-11 lg:h-8 lg:w-8"}`}
            aria-label={checkboxLabel({ fixed, title, isComplete, isPendingComplete, isWaiting })}
        >
            {fixed ? (
                <FixedMark compact={compact} />
            ) : (
                <CheckMark
                    compact={compact}
                    small={Boolean(subtask)}
                    confirmed={Boolean(showsConfirmedState)}
                    isWaiting={isWaiting}
                    isPendingComplete={isPendingComplete}
                    countdownProgress={countdownProgress}
                    sparkleKey={sparkleKey}
                />
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
