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
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { WeeklyResetSidebar, STEPS } from "../components/weekly-review/WeeklyResetSidebar";
import { trackUsageEvent } from "../lib/api/track-event";

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
                                        ? "bg-accent-primary/14 text-accent-primary hover:bg-accent-primary/20"
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
                <span><span className="text-accent-primary font-semibold">{habit.completedThisWeek}</span> done</span>
                <span><span className="font-semibold">{habit.skippedThisWeek}</span> skipped</span>
                <span><span className="text-moonlit font-semibold">{habit.pendingThisWeek}</span> pending</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onKeep}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-accent-primary/14 px-3 text-xs font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors"
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
            <div className="w-14 h-14 rounded-full bg-accent-primary/10 flex items-center justify-center mb-4">
                <Check size={24} className="text-accent-primary" />
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
    const handlePrev = () => setCurrentStep(Math.max(currentStep - 1, 0));
    const handleExit = () => {
        trackUsageEvent("weekly_reset.abandoned", { route: "weekly-review", outcome: `step_${currentStep}` });
        navigate("/");
    };
    const handleFinish = () => {
        trackUsageEvent("weekly_reset.completed", { route: "weekly-review" });
        localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
        try { localStorage.removeItem(STEP_STORAGE_KEY); } catch { /* noop */ }
        navigate("/today");
    };

    useKeyboardShortcuts({
        onNextStep: handleNext,
        onPrevStep: handlePrev,
        onExitResume: handleExit,
    });

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
                                        i < currentStep ? "bg-accent-primary/50" : i === currentStep ? "bg-accent-primary" : "bg-twilight-border/40"
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
                                <p className="text-sm text-twilight-text-soft leading-relaxed mb-2">
                                    Review what's accumulated, clear out noise, and step into the week with less on your mind.
                                </p>
                                <p className="inline-flex items-center gap-1.5 rounded-full border border-twilight-border/30 bg-white/[0.03] px-3 py-1 text-xs font-medium text-twilight-text-muted mb-8">
                                    <Clock size={12} /> About 2 minutes
                                </p>
                                <Button variant="primary" size="lg" onClick={() => {
                                    trackUsageEvent("weekly_reset.started", { route: "weekly-review" });
                                    handleNext();
                                }}>
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

                        {/* ─── Step 2 · Stabilize (unscheduled + waiting) ─── */}
                        {currentStep === 2 && (
                            <motion.div
                                key="stabilize"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="max-w-xl mx-auto w-full"
                            >
                                <div className="mb-6">
                                    <h2 className="text-lg font-display font-semibold text-twilight-text">Work to stabilize</h2>
                                    <p className="text-sm text-twilight-text-soft mt-1">
                                        {unscheduledTasks.length + visibleWaiting.length > 0
                                            ? `${unscheduledTasks.length + visibleWaiting.length} item${(unscheduledTasks.length + visibleWaiting.length) > 1 ? "s" : ""} need a home or a decision.`
                                            : "Everything is placed and accounted for."}
                                    </p>
                                </div>
                                {unscheduledTasks.length > 0 && (
                                    <>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">Unscheduled</p>
                                        <div className="flex flex-col gap-2 mb-5">
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
                                    </>
                                )}
                                {visibleWaiting.length > 0 && (
                                    <>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">Waiting on a decision</p>
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
                                    </>
                                )}
                                {unscheduledTasks.length === 0 && visibleWaiting.length === 0 && (
                                    <StepDone label="Everything is placed." onNext={handleNext} />
                                )}
                                {(unscheduledTasks.length > 0 || visibleWaiting.length > 0) && (
                                    <div className="mt-6 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={handleNext}>
                                            Skip to next step <ArrowRight size={14} />
                                        </Button>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─── Step 3 · Habits ─── */}
                        {currentStep === 3 && (
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

                        {/* ─── Step 4 · Done ─── */}
                        {currentStep === 4 && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-1 flex-col items-center justify-center text-center max-w-md mx-auto"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-accent-primary/15 flex items-center justify-center mb-6">
                                    <Check size={28} className="text-accent-primary" />
                                </div>
                                <h1 className="text-2xl font-display font-semibold text-twilight-text mb-2">You're set for the week.</h1>
                                <p className="text-sm text-twilight-text-soft leading-relaxed mb-8">
                                    Everything's been reviewed. Start wherever feels right.
                                </p>
                                <Button variant="primary" size="lg" onClick={handleFinish} className="w-full max-w-xs justify-center">
                                    Go to Today <ArrowRight size={16} />
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </MainLayout>
    );
}
