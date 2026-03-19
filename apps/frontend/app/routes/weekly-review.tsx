import { useState } from "react";
import { useNavigate } from "react-router";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { Button } from "../components/primitives/Button";
import { ArrowRight, ArrowLeft, Calendar, Sparkles, Trash2, Moon, Play, Clock, Sprout, Check, Pause, Repeat } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toISODate } from "../lib/utils/date-format";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useWeeklyReviewActions } from "../hooks/core/use-weekly-review-actions";
import { WeeklyResetSidebar, STEPS } from "../components/weekly-review/WeeklyResetSidebar";
import { ReviewCard, ReviewEmptyState } from "../components/weekly-review/ReviewCard";

/* ──────────────────────────── Page ──────────────────────────── */

export default function WeeklyReview() {
    const shell = useShellMode();
    const [currentStep, setCurrentStep] = useState(0);
    const navigate = useNavigate();
    const showSidebar = shell.isWide || shell.isLaptop;

    useDocumentMeta(
        "Weekly Reset · Cadence",
        "Process inbox items, unscheduled work, waiting tasks, and habit progress in one weekly ritual.",
    );

    const {
        inboxItems,
        unscheduledTasks,
        visibleWaiting,
        habitStats,
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
    const handleFinish = () => {
        localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
        navigate("/");
    };

    /* ── Render ── */

    return (
        <MainLayout requireAuth customSidebar={showSidebar ? <WeeklyResetSidebar currentStep={currentStep} compact={shell.isLaptop} /> : undefined} hideHeader>
            <div className="relative flex h-full flex-col bg-twilight">
                {/* Atmospheric background glow */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(232,164,74,0.06),transparent)] pointer-events-none" />

                {!showSidebar && (
                    <div className="safe-top sticky top-0 z-20 border-b border-twilight-border bg-twilight-deep/75 px-4 py-4 backdrop-blur-xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                                    Weekly Reset
                                </p>
                                <h2 className="mt-1 font-display text-2xl font-semibold text-twilight-text">
                                    {STEPS[currentStep].title}
                                </h2>
                                <p className="mt-1 text-sm text-twilight-text-soft">
                                    Step {currentStep + 1} of {STEPS.length}. {STEPS[currentStep].desc}.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
                                    navigate("/");
                                }}
                                aria-label="Exit weekly reset"
                                className="touch-target inline-flex min-h-11 items-center gap-2 rounded-2xl border border-twilight-border px-4 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                            >
                                <ArrowLeft size={16} aria-hidden="true" />
                                Exit
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {STEPS.map((step, index) => (
                                <div
                                    key={step.id}
                                    className={`rounded-2xl border px-3 py-2 text-center ${index === currentStep ? "border-lantern/30 bg-lantern/10 text-lantern" : index < currentStep ? "border-twilight-border bg-white/[0.03] text-twilight-text-soft" : "border-twilight-border/70 bg-twilight-surface/30 text-twilight-text-soft"}`}
                                >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                                        {index + 1}
                                    </p>
                                    <p className="mt-1 text-xs font-medium">
                                        {step.title}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 md:px-12">
                    <AnimatePresence mode="wait">
                        {/* ─── Step 0 · Intro ─── */}
                        {currentStep === 0 && (
                            <motion.div
                                key="intro"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="text-center max-w-lg"
                            >
                                <div className="w-24 h-24 mx-auto rounded-[2rem] bg-lantern/15 flex items-center justify-center glow-lantern mb-8 border border-lantern/20">
                                    <Sprout size={40} className="text-lantern" />
                                </div>
                                <h1 className="text-4xl lg:text-5xl font-display font-bold text-twilight-text mb-6 leading-tight">
                                    A fresh week <br /> awaits.
                                </h1>
                                <p className="text-base text-twilight-text-soft leading-relaxed mb-12">
                                    Take a deep breath. We&rsquo;re going to clear your mental noise, process your captured thoughts, and mindfully plan the week ahead.
                                </p>
                                <Button variant="primary" size="xl" onClick={handleNext} className="group">
                                    Begin Reset
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </motion.div>
                        )}

                        {/* ─── Step 1 · Inbox ─── */}
                        {currentStep === 1 && (
                            <div key="inbox" className="w-full h-full flex items-center justify-center">
                                {inboxItems.length > 0 ? (
                                    <div className="w-full">
                                        <div className="text-center mb-8">
                                            <p className="text-sm font-medium tracking-widest text-lantern uppercase mb-2">Thoughts to process</p>
                                            <p className="text-twilight-text-soft">{inboxItems.length} remaining</p>
                                        </div>
                                        <ReviewCard
                                            title={inboxItems[0].rawText || "Empty"}
                                            actionKeyPrefix={`inbox:${inboxItems[0].id}`}
                                            actions={[
                                                { label: "Do Today", icon: Play, onClick: () => handleInboxAction(inboxItems[0], "today"), variant: "cardPrimary" },
                                                { label: "Do Tomorrow", icon: Calendar, onClick: () => handleInboxAction(inboxItems[0], "tomorrow") },
                                                { label: "Decide Later", icon: Moon, onClick: () => handleInboxAction(inboxItems[0], "someday") },
                                                { label: "Discard", icon: Trash2, onClick: () => handleInboxAction(inboxItems[0], "delete"), variant: "cardDanger" },
                                            ]}
                                            pendingActionKey={pendingActionKey}
                                            actionError={actionError}
                                            onRunAction={runCardAction}
                                        />
                                    </div>
                                ) : (
                                    <ReviewEmptyState title="Inbox is clear" subtitle="Your mind is swept free of scattered thoughts." onNext={handleNext} />
                                )}
                            </div>
                        )}

                        {/* ─── Step 2 · Unscheduled ─── */}
                        {currentStep === 2 && (
                            <div key="unscheduled" className="w-full h-full flex items-center justify-center">
                                {unscheduledTasks.length > 0 ? (
                                    <div className="w-full">
                                        <div className="text-center mb-8">
                                            <p className="text-sm font-medium tracking-widest text-lantern uppercase mb-2">Unscheduled Tasks</p>
                                            <p className="text-twilight-text-soft">{unscheduledTasks.length} remaining</p>
                                        </div>
                                        <ReviewCard
                                            title={unscheduledTasks[0].title}
                                            actionKeyPrefix={`unscheduled:${unscheduledTasks[0].id}`}
                                            actions={[
                                                { label: "Assign Today", icon: Play, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "today"), variant: "cardPrimary" },
                                                { label: "Assign Tomorrow", icon: Calendar, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "tomorrow") },
                                                { label: "Move to Waitlist", icon: Moon, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "someday") },
                                                { label: "Discard", icon: Trash2, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "delete"), variant: "cardDanger" },
                                            ]}
                                            pendingActionKey={pendingActionKey}
                                            actionError={actionError}
                                            onRunAction={runCardAction}
                                        />
                                    </div>
                                ) : (
                                    <ReviewEmptyState title="All Scheduled" subtitle="Every active task has a specific day." onNext={handleNext} />
                                )}
                            </div>
                        )}

                        {/* ─── Step 3 · Waiting ─── */}
                        {currentStep === 3 && (
                            <div key="waiting" className="w-full h-full flex items-center justify-center">
                                {visibleWaiting.length > 0 ? (
                                    <div className="w-full">
                                        <div className="text-center mb-8">
                                            <p className="text-sm font-medium tracking-widest text-lantern uppercase mb-2">Backlogged Tasks</p>
                                            <p className="text-twilight-text-soft">{visibleWaiting.length} remaining</p>
                                        </div>
                                        <ReviewCard
                                            title={visibleWaiting[0].title}
                                            actionKeyPrefix={`waiting:${visibleWaiting[0].id}`}
                                            actions={[
                                                { label: "Activate Today", icon: Play, onClick: () => handleWaitingAction(visibleWaiting[0], "today"), variant: "cardPrimary" },
                                                { label: "Activate Tomorrow", icon: Calendar, onClick: () => handleWaitingAction(visibleWaiting[0], "tomorrow") },
                                                { label: "Keep Waiting", icon: Clock, onClick: async () => { setKeptWaitingIds((prev) => new Set(prev).add(visibleWaiting[0].id)); } },
                                                { label: "Discard", icon: Trash2, onClick: () => handleWaitingAction(visibleWaiting[0], "delete"), variant: "cardDanger" },
                                            ]}
                                            pendingActionKey={pendingActionKey}
                                            actionError={actionError}
                                            onRunAction={runCardAction}
                                        />
                                    </div>
                                ) : (
                                    <ReviewEmptyState title="Waitlist Tidy" subtitle="You\u2019ve reviewed all your backlogged tasks." onNext={handleNext} />
                                )}
                            </div>
                        )}

                        {/* ─── Step 4 · Habits ─── */}
                        {currentStep === 4 && (
                            <div key="habits" className="w-full h-full flex items-center justify-center">
                                {unreviewedHabits.length > 0 ? (
                                    <div className="w-full">
                                        <div className="text-center mb-8">
                                            <p className="text-sm font-medium tracking-widest text-moonlit uppercase mb-2">Routine check-in</p>
                                            <p className="text-twilight-text-soft">{unreviewedHabits.length} routine{unreviewedHabits.length > 1 ? "s" : ""} to review</p>
                                        </div>

                                        <motion.div
                                            key={unreviewedHabits[0].id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -20 }}
                                            className="mx-auto max-w-lg"
                                        >
                                            <div className="rounded-3xl border border-twilight-border bg-twilight-surface/50 p-8">
                                                <div className="mb-6 flex items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-moonlit/10 text-moonlit">
                                                        <Repeat size={18} />
                                                    </div>
                                                    <h3 className="font-display text-xl font-semibold text-twilight-text">{unreviewedHabits[0].title}</h3>
                                                </div>

                                                <div className="mb-8 grid grid-cols-3 gap-3 text-center">
                                                    <div className="rounded-2xl border border-twilight-border bg-white/[0.03] px-3 py-4">
                                                        <div className="text-2xl font-display font-bold text-lantern">{unreviewedHabits[0].completedThisWeek}</div>
                                                        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-muted">Completed</div>
                                                    </div>
                                                    <div className="rounded-2xl border border-twilight-border bg-white/[0.03] px-3 py-4">
                                                        <div className="text-2xl font-display font-bold text-twilight-text-soft">{unreviewedHabits[0].skippedThisWeek}</div>
                                                        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-muted">Skipped</div>
                                                    </div>
                                                    <div className="rounded-2xl border border-twilight-border bg-white/[0.03] px-3 py-4">
                                                        <div className="text-2xl font-display font-bold text-moonlit">{unreviewedHabits[0].pendingThisWeek}</div>
                                                        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-muted">Pending</div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => markHabitReviewed(unreviewedHabits[0].id)}
                                                        className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-lantern/30 bg-lantern/14 px-4 text-sm font-medium text-lantern transition-colors hover:bg-lantern/20"
                                                    >
                                                        <Check size={16} />
                                                        Keep this routine
                                                    </button>
                                                    {!unreviewedHabits[0].hasTargetTime ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                markHabitReviewed(unreviewedHabits[0].id);
                                                                navigate(`/habits`);
                                                            }}
                                                            className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06]"
                                                        >
                                                            <Clock size={16} />
                                                            Add a specific time
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            markHabitReviewed(unreviewedHabits[0].id);
                                                        }}
                                                        className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06]"
                                                    >
                                                        <ArrowRight size={16} />
                                                        Simplify this routine
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            pauseHabit.pause(unreviewedHabits[0].id);
                                                            markHabitReviewed(unreviewedHabits[0].id);
                                                        }}
                                                        className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06]"
                                                    >
                                                        <Pause size={16} />
                                                        Pause for a week
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>
                                ) : (
                                    <ReviewEmptyState
                                        title={habitReviewItems.length > 0 ? "Routines reviewed" : "No routines this week"}
                                        subtitle={habitReviewItems.length > 0 ? "You've reflected on each routine. Onward." : "Visit the Routines tab to start a new rhythm."}
                                        onNext={handleNext}
                                    />
                                )}
                            </div>
                        )}

                        {/* ─── Step 5 · Ready ─── */}
                        {currentStep === 5 && (
                            <motion.div key="ready" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-lg">
                                <div className="w-24 h-24 mx-auto rounded-[2rem] bg-lantern/20 flex items-center justify-center glow-lantern mb-8 border border-lantern/30">
                                    <Sparkles size={40} className="text-lantern" />
                                </div>
                                <h1 className="text-4xl font-display font-bold text-twilight-text mb-4">You&rsquo;re ready.</h1>
                                <p className="text-base text-twilight-text-soft leading-relaxed mb-12">
                                    Your mind is clear. Your tasks are aligned. <br />Step into the week with focus.
                                </p>
                                <Button variant="primary" size="xl" onClick={handleFinish} className="w-full justify-center">
                                    End Reset <ArrowRight size={18} />
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </MainLayout>
    );
}
