import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { MainLayout } from "../components/MainLayout";
import { Button } from "../components/primitives/Button";
import { CheckCircle, ArrowRight, ArrowLeft, Inbox, ListTodo, Clock, Flame, Sprout, Calendar, Sparkles, Trash2, Moon, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInbox, useDeleteInboxItem } from "../hooks/inbox";
import { useTasks, useUpdateTask, useCreateTask, useDeleteTask } from "../hooks/tasks";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { toISODate } from "../lib/utils/date-format";
import type { Task } from "../types/task";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useShellMode } from "../hooks/use-shell-mode";

const STEPS = [
    { id: "intro", title: "Welcome", icon: Sparkles, desc: "Begin your reset" },
    { id: "inbox", title: "Inbox Zero", icon: Inbox, desc: "Process thoughts" },
    { id: "unscheduled", title: "Unscheduled", icon: ListTodo, desc: "Assign dates" },
    { id: "waiting", title: "Waiting", icon: Clock, desc: "Review backlog" },
    { id: "habits", title: "Habit Checks", icon: Flame, desc: "Review progress" },
    { id: "ready", title: "Ready", icon: Sprout, desc: "Start fresh" },
];

/* ──────────────────────────── Sidebar ──────────────────────────── */

function WeeklyResetSidebar({ currentStep, compact = false }: { currentStep: number; compact?: boolean }) {
    return (
        <div className={`${compact ? "w-[240px]" : "w-[280px]"} flex shrink-0 flex-col border-r border-twilight-border bg-twilight-surface/30 py-8 backdrop-blur-3xl relative overflow-hidden transition-all duration-500 z-50 shadow-2xl shadow-black/20`}>
            {/* Brand */}
            <div className="mb-12 flex items-center justify-start gap-4 px-6">
                <img src="/logo.png" alt="Cadence" className="h-10 w-10 rounded-2xl object-cover shadow-[0_0_18px_rgba(232,164,74,0.12)]" />
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Cadence</p>
                    <span className="font-display font-semibold text-lg text-twilight-text tracking-wide whitespace-nowrap">
                        Weekly Reset
                    </span>
                </div>
            </div>

            {/* Steps */}
            <div className="flex-1 space-y-5 px-6">
                {STEPS.map((step, idx) => {
                    const isActive = idx === currentStep;
                    const isPast = idx < currentStep;
                    const Icon = step.icon;

                    return (
                        <div key={step.id} className="relative flex items-center justify-start group">
                            {/* Connector line */}
                            {idx !== STEPS.length - 1 && (
                                <div className={`absolute left-[21px] top-12 h-10 w-px transition-colors duration-500 ${isPast ? "bg-lantern/50" : "bg-twilight-border/30"}`} />
                            )}

                            <div className={`h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 shrink-0 ${isActive
                                ? "border-lantern text-lantern bg-lantern/10 shadow-[0_0_20px_rgba(232,164,74,0.3)] scale-110"
                                : isPast
                                    ? "border-lantern/40 text-lantern/60 bg-twilight-surface"
                                    : "border-twilight-border text-twilight-text-muted bg-twilight-deep"
                                }`}>
                                {isPast ? <CheckCircle size={18} className="text-lantern" /> : <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />}
                            </div>

                            <div className="ml-5">
                                <h3 className={`font-medium transition-colors duration-300 ${isActive ? "text-twilight-text" : isPast ? "text-twilight-text-soft" : "text-twilight-text-soft"}`}>
                                    {step.title}
                                </h3>
                                <p className={`text-[12px] transition-colors duration-300 ${isActive ? "text-twilight-text-muted" : "hidden"}`}>
                                    {step.desc}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Skip & Exit */}
            <div className="mt-auto px-4 lg:px-6">
                <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                        localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
                        window.location.href = "/";
                    }}
                    aria-label="Exit weekly reset"
                    className="w-full justify-start gap-3 whitespace-nowrap"
                >
                    <ArrowLeft size={16} />
                    <span>Skip &amp; Exit</span>
                </Button>
            </div>
        </div>
    );
}

/* ──────────────────────────── Page ──────────────────────────── */

export default function WeeklyReview() {
    const shell = useShellMode();
    const [currentStep, setCurrentStep] = useState(0);
    const navigate = useNavigate();
    const showSidebar = shell.isWide || shell.isLaptop;
    const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    useDocumentMeta(
        "Weekly Reset · Cadence",
        "Process inbox items, unscheduled work, waiting tasks, and habit progress in one weekly ritual.",
    );

    const { data: inboxItems = [] } = useInbox();
    const { data: activeTasks = [] } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks = [] } = useTasks({ state: "WAITING" });

    const updateTask = useUpdateTask();
    const createTask = useCreateTask();
    const deleteTask = useDeleteTask();
    const deleteInboxItem = useDeleteInboxItem();

    const unscheduledTasks = useMemo(
        () => activeTasks.filter((t) => !t.scheduledStart),
        [activeTasks],
    );

    // Quick‑action date helpers
    const getToday = () => toISODate(new Date());
    const getTomorrow = () => {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        return toISODate(t);
    };

    /* ── Actions ── */

    const runCardAction = async (actionKey: string, actionFn: () => Promise<void>) => {
        if (pendingActionKey) return;
        setPendingActionKey(actionKey);
        setActionError(null);
        try {
            await actionFn();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Something went wrong while processing this step.");
        } finally {
            setPendingActionKey(null);
        }
    };

    const handleInboxAction = async (item: any, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") {
            await deleteInboxItem.mutateAsync(item.id);
        } else if (action === "today") {
            await createTask.mutateAsync({ title: item.rawText, dueDate: getToday(), isAllDay: true, orderIndex: 0 });
            await deleteInboxItem.mutateAsync(item.id);
        } else if (action === "tomorrow") {
            await createTask.mutateAsync({ title: item.rawText, dueDate: getTomorrow(), isAllDay: true, orderIndex: 0 });
            await deleteInboxItem.mutateAsync(item.id);
        } else if (action === "someday") {
            const newTask = await createTask.mutateAsync({ title: item.rawText, orderIndex: 0 });
            if (newTask) {
                await updateTask.mutateAsync({ id: newTask.id, state: "WAITING" });
            }
            await deleteInboxItem.mutateAsync(item.id);
        }
    };

    const handleUnscheduledAction = async (task: Task, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") {
            await deleteTask.mutateAsync(task.id);
        } else if (action === "today") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getToday(), scheduledStart: null, scheduledEnd: null, isAllDay: true });
        } else if (action === "tomorrow") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getTomorrow(), scheduledStart: null, scheduledEnd: null, isAllDay: true });
        } else if (action === "someday") {
            await updateTask.mutateAsync({ id: task.id, state: "WAITING" });
        }
    };

    const handleWaitingAction = async (task: Task, action: "today" | "tomorrow" | "keep" | "delete") => {
        if (action === "delete") {
            await deleteTask.mutateAsync(task.id);
        } else if (action === "today") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getToday(), scheduledStart: null, scheduledEnd: null, isAllDay: true, state: "ACTIVE" });
        } else if (action === "tomorrow") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getTomorrow(), scheduledStart: null, scheduledEnd: null, isAllDay: true, state: "ACTIVE" });
        } else if (action === "keep") {
            setKeptWaitingIds((prev) => new Set(prev).add(task.id));
        }
    };

    // Local state to "dismiss" kept‑waiting items from view
    const [keptWaitingIds, setKeptWaitingIds] = useState<Set<string>>(new Set());
    const visibleWaiting = waitingTasks.filter((t) => !keptWaitingIds.has(t.id));

    // Habit stats
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const { data: habits = [] } = useHabitsWeekly({
        start: toISODate(weekAgo),
        end: toISODate(today),
        enabled: currentStep === 4,
    });

    const habitStats = useMemo(() => {
        let total = 0;
        let completed = 0;
        for (const h of habits) {
            const logs = h.logs ?? [];
            total += logs.length;
            completed += logs.filter((l: any) => l.status === "COMPLETED").length;
        }
        return { total, completed };
    }, [habits]);

    const handleNext = () => setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1));
    const handleFinish = () => {
        localStorage.setItem("cadence_last_weekly_reset", toISODate(new Date()));
        navigate("/");
    };

    /* ── Reusable card renderer ── */

    const renderCard = (
        title: string,
        actionKeyPrefix: string,
        actions: { label: string; icon: any; onClick: () => Promise<void> | void; variant?: "cardPrimary" | "card" | "cardDanger" }[],
    ) => (
        <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 1.05 }}
            key={title}
            className="bg-twilight-surface/40 backdrop-blur-xl border border-twilight-border rounded-[32px] p-10 max-w-lg w-full mx-auto shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden group"
        >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
            <h3 className="text-2xl font-display font-medium text-twilight-text mb-12 leading-relaxed">
                &ldquo;{title}&rdquo;
            </h3>

            {actionError ? (
                <p className="mb-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {actionError}
                </p>
            ) : null}

            <div className="grid grid-cols-2 gap-4 w-full">
                {actions.map((act, i) => {
                    const ActIcon = act.icon;
                    const actionKey = `${actionKeyPrefix}:${i}`;
                    const isPending = pendingActionKey === actionKey;
                    return (
                        <Button
                            key={i}
                            variant={act.variant ?? "card"}
                            size="card"
                            onClick={() => void runCardAction(actionKey, async () => { await act.onClick(); })}
                            disabled={Boolean(pendingActionKey)}
                        >
                            <ActIcon size={20} strokeWidth={2} />
                            <span className="font-medium">{isPending ? "Working..." : act.label}</span>
                        </Button>
                    );
                })}
            </div>
        </motion.div>
    );

    const renderEmptyState = (title: string, subtitle: string, nextStepFn: () => void) => (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center py-16"
        >
            <div className="w-20 h-20 rounded-full bg-lantern/10 flex items-center justify-center mb-6 glow-lantern">
                <CheckCircle size={32} className="text-lantern" />
            </div>
            <h2 className="text-3xl font-display font-semibold text-twilight-text mb-3">{title}</h2>
            <p className="text-twilight-text-muted mb-10 max-w-sm">{subtitle}</p>
            <Button variant="primary" size="lg" onClick={nextStepFn}>
                Continue <ArrowRight size={18} />
            </Button>
        </motion.div>
    );

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
                                        {renderCard(inboxItems[0].rawText || "Empty", `inbox:${inboxItems[0].id}`, [
                                            { label: "Do Today", icon: Play, onClick: () => handleInboxAction(inboxItems[0], "today"), variant: "cardPrimary" },
                                            { label: "Do Tomorrow", icon: Calendar, onClick: () => handleInboxAction(inboxItems[0], "tomorrow") },
                                            { label: "Decide Later", icon: Moon, onClick: () => handleInboxAction(inboxItems[0], "someday") },
                                            { label: "Discard", icon: Trash2, onClick: () => handleInboxAction(inboxItems[0], "delete"), variant: "cardDanger" },
                                        ])}
                                    </div>
                                ) : (
                                    renderEmptyState("Inbox is clear", "Your mind is swept free of scattered thoughts.", handleNext)
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
                                        {renderCard(unscheduledTasks[0].title, `unscheduled:${unscheduledTasks[0].id}`, [
                                            { label: "Assign Today", icon: Play, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "today"), variant: "cardPrimary" },
                                            { label: "Assign Tomorrow", icon: Calendar, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "tomorrow") },
                                            { label: "Move to Waitlist", icon: Moon, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "someday") },
                                            { label: "Discard", icon: Trash2, onClick: () => handleUnscheduledAction(unscheduledTasks[0], "delete"), variant: "cardDanger" },
                                        ])}
                                    </div>
                                ) : (
                                    renderEmptyState("All Scheduled", "Every active task has a specific day.", handleNext)
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
                                        {renderCard(visibleWaiting[0].title, `waiting:${visibleWaiting[0].id}`, [
                                            { label: "Activate Today", icon: Play, onClick: () => handleWaitingAction(visibleWaiting[0], "today"), variant: "cardPrimary" },
                                            { label: "Activate Tomorrow", icon: Calendar, onClick: () => handleWaitingAction(visibleWaiting[0], "tomorrow") },
                                            { label: "Keep Waiting", icon: Clock, onClick: async () => { setKeptWaitingIds((prev) => new Set(prev).add(visibleWaiting[0].id)); } },
                                            { label: "Discard", icon: Trash2, onClick: () => handleWaitingAction(visibleWaiting[0], "delete"), variant: "cardDanger" },
                                        ])}
                                    </div>
                                ) : (
                                    renderEmptyState("Waitlist Tidy", "You\u2019ve reviewed all your backlogged tasks.", handleNext)
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
