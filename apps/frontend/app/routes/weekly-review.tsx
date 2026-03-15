import { useState } from "react";
import { useNavigate } from "react-router";
import { MainLayout } from "../components/layout/MainLayout";
import { Button } from "../components/primitives/Button";
import { ArrowRight, ArrowLeft, Calendar, Sparkles, Trash2, Moon, Play, Clock, Sprout } from "lucide-react";
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
        pendingActionKey,
        actionError,
        runCardAction,
        handleInboxAction,
        handleUnscheduledAction,
        handleWaitingAction,
        setKeptWaitingIds,
    } = useWeeklyReviewActions(currentStep);

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
                            <motion.div key="habits" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center max-w-xl">
                                <h1 className="text-3xl font-display font-semibold text-twilight-text mb-12">How did habits go?</h1>
                                {habitStats.total > 0 ? (
                                    <div className="grid grid-cols-2 gap-6 mb-12">
                                        <div className="bg-twilight-surface/50 border border-twilight-border p-8 rounded-3xl">
                                            <div className="text-4xl font-display font-bold text-twilight-text mb-2">{habitStats.total}</div>
                                            <div className="text-twilight-text-muted text-sm">Target</div>
                                        </div>
                                        <div className="bg-lantern/10 border border-lantern/20 glow-lantern p-8 rounded-3xl relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-br from-lantern/5 to-transparent pointer-events-none" />
                                            <div className="text-4xl font-display font-bold text-lantern mb-2 relative z-10">{habitStats.completed}</div>
                                            <div className="text-lantern/80 text-sm font-medium relative z-10">Completed</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-twilight-surface border border-twilight-border p-8 rounded-3xl mb-12">
                                        <p className="text-twilight-text-soft italic">No habits tracked this week. Visit the Habits tab to start a new rhythm.</p>
                                    </div>
                                )}
                                <Button variant="secondary" size="lg" onClick={handleNext}>
                                    Reflect &amp; Continue <ArrowRight size={18} />
                                </Button>
                            </motion.div>
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
