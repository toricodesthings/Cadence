import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { Button } from "../components/primitives/Button";
import { ArrowRight, ArrowLeft, Clock, Check, Pause, Repeat } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toISODate } from "../lib/utils/date-format";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useWeeklyReviewActions } from "../hooks/core/use-weekly-review-actions";
import { WeeklyResetSidebar, STEPS } from "../components/weekly-review/WeeklyResetSidebar";

const STEP_STORAGE_KEY = "cadence-weekly-reset-step";

/* ──────── Inline scannable list item ──────── */

function ReviewListItem({
    title,
    actions,
    pendingActionKey,
    actionKeyPrefix,
    actionError,
    onRunAction,
}: {
    title: string;
    actions: Array<{ label: string; shortLabel?: string; onClick: () => Promise<void> | void; variant?: string }>;
    pendingActionKey: string | null;
    actionKeyPrefix: string;
    actionError: string | null;
    onRunAction: (key: string, fn: () => Promise<void>) => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-twilight-border/40 bg-twilight-surface/30 px-4 py-3 transition-colors hover:bg-white/[0.03]">
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-twilight-text">
                {title}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
                {actions.map((act, i) => {
                    const key = `${actionKeyPrefix}:${i}`;
                    const isPending = pendingActionKey === key;
                    const isDanger = act.variant === "cardDanger";
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={Boolean(pendingActionKey)}
                            onClick={() => void onRunAction(key, async () => { await act.onClick(); })}
                            className={`touch-target inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-xs font-medium transition-colors disabled:opacity-40 ${
                                isDanger
                                    ? "text-red-400 hover:bg-red-500/10"
                                    : act.variant === "cardPrimary"
                                        ? "bg-lantern/14 text-lantern hover:bg-lantern/20"
                                        : "text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                            }`}
                            title={act.label}
                        >
                            {isPending ? "…" : act.shortLabel ?? act.label}
                        </button>
                    );
                })}
            </div>
            {actionError && (
                <span className="text-xs text-red-400">{actionError}</span>
            )}
        </div>
    );
}

/* ──────── Habit review row ──────── */

function HabitReviewRow({
    habit,
    onKeep,
    onPause,
    onOpenInHabits,
}: {
    habit: { id: string; title: string; completedThisWeek: number; skippedThisWeek: number; pendingThisWeek: number; hasTargetTime: boolean };
    onKeep: () => void;
    onPause: () => void;
    onOpenInHabits: () => void;
}) {
    return (
        <div className="rounded-2xl border border-twilight-border/40 bg-twilight-surface/30 px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-moonlit/10 text-moonlit">
                    <Repeat size={14} />
                </div>
                <h4 className="text-sm font-medium text-twilight-text flex-1 truncate">{habit.title}</h4>
            </div>
            <div className="flex items-center gap-4 mb-3 text-xs text-twilight-text-muted">
                <span><span className="text-lantern font-semibold">{habit.completedThisWeek}</span> done</span>
                <span><span className="font-semibold">{habit.skippedThisWeek}</span> skipped</span>
                <span><span className="text-moonlit font-semibold">{habit.pendingThisWeek}</span> pending</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onKeep}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-lantern/14 px-3 text-xs font-medium text-lantern hover:bg-lantern/20 transition-colors"
                >
                    <Check size={13} /> Keep
                </button>
                <button
                    type="button"
                    onClick={onPause}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-twilight-text-soft hover:bg-white/[0.06] transition-colors"
                >
                    <Pause size={13} /> Pause
                </button>
                <button
                    type="button"
                    onClick={onOpenInHabits}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-twilight-text-soft hover:bg-white/[0.06] transition-colors"
                >
                    <Clock size={13} /> Edit
                </button>
            </div>
        </div>
    );
}

/* ──────── Step empty state ──────── */

function StepDone({ label, onNext }: { label: string; onNext: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="w-14 h-14 rounded-full bg-lantern/10 flex items-center justify-center mb-4">
                <Check size={24} className="text-lantern" />
            </div>
            <p className="text-sm text-twilight-text-soft mb-6">{label}</p>
            <Button variant="primary" size="md" onClick={onNext}>
                Continue <ArrowRight size={16} />
            </Button>
        </div>
    );
}

/* ──────────────────────────── Page ──────────────────────────── */

export default function WeeklyReview() {
    const shell = useShellMode();
    const navigate = useNavigate();
    const showSidebar = shell.isWide || shell.isLaptop;

    // Persist step across leave/resume
    const [currentStep, setCurrentStepRaw] = useState(() => {
        try {
            const saved = localStorage.getItem(STEP_STORAGE_KEY);
            if (saved) {
                const n = parseInt(saved, 10);
                if (n >= 0 && n < STEPS.length) return n;
            }
        } catch { /* noop */ }
        return 0;
    });
    const setCurrentStep = useCallback((step: number | ((prev: number) => number)) => {
        setCurrentStepRaw((prev) => {
            const next = typeof step === "function" ? step(prev) : step;
            try { localStorage.setItem(STEP_STORAGE_KEY, String(next)); } catch { /* noop */ }
            return next;
        });
    }, []);

    useDocumentMeta(
        "Weekly Reset · Cadence",
        "Process inbox items, unscheduled work, waiting tasks, and habit progress in one weekly ritual.",
    );

    const {
        inboxItems,
        unscheduledTasks,
        visibleWaiting,
        habitReviewItems,
        pauseHabit,
        pendingActionKey,
        actionError,
        runCardAction,
        handleInboxAction,
        handleUnscheduledAction,
        handleWaitingAction,
        setKeptWaitingIds,
    } = useWeeklyReviewActions(currentStep);

    const [reviewedHabitIds, setReviewedHabitIds] = useState<Set<string>>(new Set());
    const unreviewedHabits = habitReviewItems.filter((h) => !reviewedHabitIds.has(h.id));

    const markHabitReviewed = (id: string) => {
        setReviewedHabitIds((prev) => new Set(prev).add(id));
    };

    const handleNext = () => setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1));
    const handleExit = () => navigate("/");
    const handleFinish = () => {
        localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
        try { localStorage.removeItem(STEP_STORAGE_KEY); } catch { /* noop */ }
        navigate("/");
    };

    return (
        <MainLayout
            requireAuth
            customSidebar={showSidebar ? <WeeklyResetSidebar currentStep={currentStep} compact={shell.isLaptop} onExit={handleExit} /> : undefined}
            hideHeader
        >
            <div className="relative flex h-full flex-col bg-twilight">
                {!showSidebar && (
                    <div className="safe-top sticky top-0 z-20 border-b border-twilight-border bg-twilight-deep/75 px-4 py-3 backdrop-blur-xl">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                                    Weekly Reset — Step {currentStep + 1}/{STEPS.length}
                                </p>
                                <h2 className="mt-0.5 font-display text-lg font-semibold text-twilight-text truncate">
                                    {STEPS[currentStep].title}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={handleExit}
                                aria-label="Exit weekly reset"
                                className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-twilight-border px-3 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04]"
                            >
                                <ArrowLeft size={14} aria-hidden="true" />
                                Exit
                            </button>
                        </div>

                        {/* Compact step dots */}
                        <div className="mt-2 flex gap-1.5">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1 flex-1 rounded-full transition-colors ${
                                        i < currentStep ? "bg-lantern/50" : i === currentStep ? "bg-lantern" : "bg-twilight-border/40"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="z-10 flex flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-8 md:px-12">
                    <AnimatePresence mode="wait">
                        {/* ─── Step 0 · Intro ─── */}
                        {currentStep === 0 && (
                            <motion.div
                                key="intro"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="flex flex-1 flex-col items-center justify-center text-center max-w-md mx-auto"
                            >
                                <h1 className="text-2xl lg:text-3xl font-display font-semibold text-twilight-text mb-3 leading-tight">
                                    Weekly Reset
                                </h1>
                                <p className="text-sm text-twilight-text-soft leading-relaxed mb-8">
                                    Review what's accumulated, clear out noise, and step into the week with less on your mind.
                                </p>
                                <Button variant="primary" size="lg" onClick={handleNext}>
                                    Start <ArrowRight size={16} />
                                </Button>
                            </motion.div>
                        )}

                        {/* ─── Step 1 · Inbox ─── */}
                        {currentStep === 1 && (
                            <motion.div
                                key="inbox"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="max-w-xl mx-auto w-full"
                            >
                                <div className="mb-6">
                                    <h2 className="text-lg font-display font-semibold text-twilight-text">Captured thoughts</h2>
                                    <p className="text-sm text-twilight-text-soft mt-1">
                                        {inboxItems.length > 0
                                            ? `${inboxItems.length} item${inboxItems.length > 1 ? "s" : ""} to sort through.`
                                            : "Nothing here — inbox is clear."}
                                    </p>
                                </div>
                                {inboxItems.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {inboxItems.map((item) => (
                                            <ReviewListItem
                                                key={item.id}
                                                title={item.rawText || "Empty"}
                                                actionKeyPrefix={`inbox:${item.id}`}
                                                actions={[
                                                    { label: "Do Today", shortLabel: "Today", onClick: () => handleInboxAction(item, "today"), variant: "cardPrimary" },
                                                    { label: "Do Tomorrow", shortLabel: "Tomorrow", onClick: () => handleInboxAction(item, "tomorrow") },
                                                    { label: "Decide Later", shortLabel: "Later", onClick: () => handleInboxAction(item, "someday") },
                                                    { label: "Move to Trash", shortLabel: "Trash", onClick: () => handleInboxAction(item, "delete"), variant: "cardDanger" },
                                                ]}
                                                pendingActionKey={pendingActionKey}
                                                actionError={actionError}
                                                onRunAction={runCardAction}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <StepDone label="Inbox is clear." onNext={handleNext} />
                                )}
                                {inboxItems.length > 0 && (
                                    <div className="mt-6 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={handleNext}>
                                            Skip to next step <ArrowRight size={14} />
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─── Step 2 · Unscheduled ─── */}
                        {currentStep === 2 && (
                            <motion.div
                                key="unscheduled"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="max-w-xl mx-auto w-full"
                            >
                                <div className="mb-6">
                                    <h2 className="text-lg font-display font-semibold text-twilight-text">Unscheduled tasks</h2>
                                    <p className="text-sm text-twilight-text-soft mt-1">
                                        {unscheduledTasks.length > 0
                                            ? `${unscheduledTasks.length} task${unscheduledTasks.length > 1 ? "s" : ""} without a date.`
                                            : "Everything has a date."}
                                    </p>
                                </div>
                                {unscheduledTasks.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {unscheduledTasks.map((task) => (
                                            <ReviewListItem
                                                key={task.id}
                                                title={task.title}
                                                actionKeyPrefix={`unscheduled:${task.id}`}
                                                actions={[
                                                    { label: "Assign Today", shortLabel: "Today", onClick: () => handleUnscheduledAction(task, "today"), variant: "cardPrimary" },
                                                    { label: "Assign Tomorrow", shortLabel: "Tomorrow", onClick: () => handleUnscheduledAction(task, "tomorrow") },
                                                    { label: "Move to Waitlist", shortLabel: "Later", onClick: () => handleUnscheduledAction(task, "someday") },
                                                    { label: "Move to Trash", shortLabel: "Trash", onClick: () => handleUnscheduledAction(task, "delete"), variant: "cardDanger" },
                                                ]}
                                                pendingActionKey={pendingActionKey}
                                                actionError={actionError}
                                                onRunAction={runCardAction}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <StepDone label="All tasks are scheduled." onNext={handleNext} />
                                )}
                                {unscheduledTasks.length > 0 && (
                                    <div className="mt-6 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={handleNext}>
                                            Skip to next step <ArrowRight size={14} />
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─── Step 3 · Waiting ─── */}
                        {currentStep === 3 && (
                            <motion.div
                                key="waiting"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="max-w-xl mx-auto w-full"
                            >
                                <div className="mb-6">
                                    <h2 className="text-lg font-display font-semibold text-twilight-text">Backlogged tasks</h2>
                                    <p className="text-sm text-twilight-text-soft mt-1">
                                        {visibleWaiting.length > 0
                                            ? `${visibleWaiting.length} task${visibleWaiting.length > 1 ? "s" : ""} waiting for a decision.`
                                            : "Waitlist is clear."}
                                    </p>
                                </div>
                                {visibleWaiting.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {visibleWaiting.map((task) => (
                                            <ReviewListItem
                                                key={task.id}
                                                title={task.title}
                                                actionKeyPrefix={`waiting:${task.id}`}
                                                actions={[
                                                    { label: "Activate Today", shortLabel: "Today", onClick: () => handleWaitingAction(task, "today"), variant: "cardPrimary" },
                                                    { label: "Activate Tomorrow", shortLabel: "Tomorrow", onClick: () => handleWaitingAction(task, "tomorrow") },
                                                    { label: "Keep Waiting", shortLabel: "Keep", onClick: async () => { setKeptWaitingIds((prev) => new Set(prev).add(task.id)); } },
                                                    { label: "Move to Trash", shortLabel: "Trash", onClick: () => handleWaitingAction(task, "delete"), variant: "cardDanger" },
                                                ]}
                                                pendingActionKey={pendingActionKey}
                                                actionError={actionError}
                                                onRunAction={runCardAction}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <StepDone label="Waitlist reviewed." onNext={handleNext} />
                                )}
                                {visibleWaiting.length > 0 && (
                                    <div className="mt-6 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={handleNext}>
                                            Skip to next step <ArrowRight size={14} />
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─── Step 4 · Habits ─── */}
                        {currentStep === 4 && (
                            <motion.div
                                key="habits"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="max-w-xl mx-auto w-full"
                            >
                                <div className="mb-6">
                                    <h2 className="text-lg font-display font-semibold text-twilight-text">Routine check-in</h2>
                                    <p className="text-sm text-twilight-text-soft mt-1">
                                        {unreviewedHabits.length > 0
                                            ? `${unreviewedHabits.length} routine${unreviewedHabits.length > 1 ? "s" : ""} to reflect on.`
                                            : habitReviewItems.length > 0
                                                ? "All routines reviewed."
                                                : "No routines this week."}
                                    </p>
                                </div>
                                {unreviewedHabits.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {unreviewedHabits.map((habit) => (
                                            <HabitReviewRow
                                                key={habit.id}
                                                habit={habit}
                                                onKeep={() => markHabitReviewed(habit.id)}
                                                onPause={() => {
                                                    pauseHabit.pause(habit.id);
                                                    markHabitReviewed(habit.id);
                                                }}
                                                onOpenInHabits={() => {
                                                    markHabitReviewed(habit.id);
                                                    navigate("/habits");
                                                }}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <StepDone
                                        label={habitReviewItems.length > 0 ? "Routines reviewed." : "Visit Habits to start a rhythm."}
                                        onNext={handleNext}
                                    />
                                )}
                                {unreviewedHabits.length > 0 && (
                                    <div className="mt-6 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={handleNext}>
                                            Skip to next step <ArrowRight size={14} />
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─── Step 5 · Done ─── */}
                        {currentStep === 5 && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-1 flex-col items-center justify-center text-center max-w-md mx-auto"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-lantern/15 flex items-center justify-center mb-6">
                                    <Check size={28} className="text-lantern" />
                                </div>
                                <h1 className="text-2xl font-display font-semibold text-twilight-text mb-2">Reset complete.</h1>
                                <p className="text-sm text-twilight-text-soft leading-relaxed mb-8">
                                    Your week is organized. Get started.
                                </p>
                                <Button variant="primary" size="lg" onClick={handleFinish} className="w-full max-w-xs justify-center">
                                    Done <ArrowRight size={16} />
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </MainLayout>
    );
}
