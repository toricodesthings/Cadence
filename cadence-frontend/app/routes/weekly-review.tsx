import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { MainLayout } from "../components/MainLayout";
import { CheckCircle, ArrowRight, ArrowLeft, Inbox, ListTodo, Clock, Flame, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInbox } from "../hooks/inbox";
import { useTasks, useUpdateTask } from "../hooks/tasks";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { TaskList } from "../components/tasks/TaskList";
import { toISODate } from "../lib/utils/date-format";
import type { Task } from "../types/task";

const STEPS = [
    { title: "Inbox Review", id: "inbox", icon: Inbox },
    { title: "Unscheduled Tasks", id: "unscheduled", icon: ListTodo },
    { title: "Waiting Tasks", id: "waiting", icon: Clock },
    { title: "Habit Check-in", id: "habits", icon: Flame },
    { title: "Week Ready", id: "ready", icon: Sparkles },
];

export default function WeeklyReview() {
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleNext = () => setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1));
    const handlePrev = () => setCurrentStep(Math.max(currentStep - 1, 0));

    const { data: inboxItems = [] } = useInbox();
    const { data: activeTasks = [] } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks = [] } = useTasks({ state: "WAITING" });
    const updateTask = useUpdateTask();

    // Unscheduled tasks — active with no scheduledStart
    const unscheduledTasks = useMemo(
        () => activeTasks.filter((t) => !t.scheduledStart),
        [activeTasks]
    );

    // Habit stats for the past week
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const { data: habits = [] } = useHabitsWeekly({
        start: toISODate(weekAgo),
        end: toISODate(today),
        enabled: currentStep === 3,
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

    // Summary counts for the final step
    const scheduledCount = activeTasks.filter((t) => !!t.scheduledStart).length;

    const StepIcon = STEPS[currentStep].icon;

    return (
        <MainLayout requireAuth>
            <div className="flex flex-col h-full">
                {/* Atmospheric background */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_-15%,rgba(232,164,74,0.04),transparent)] pointer-events-none" />

                <div className="relative flex-1 flex flex-col items-center justify-center px-8 py-12 z-10">
                    {/* Step dots */}
                    <div className="flex items-center gap-2 mb-12">
                        {STEPS.map((step, idx) => (
                            <button
                                key={step.id}
                                onClick={() => setCurrentStep(idx)}
                                className={`transition-all duration-300 rounded-full ${idx === currentStep
                                    ? "w-8 h-2 bg-lantern"
                                    : idx < currentStep
                                        ? "w-2 h-2 bg-lantern/40"
                                        : "w-2 h-2 bg-white/[0.1]"
                                    }`}
                                aria-label={`Go to step: ${step.title}`}
                            />
                        ))}
                    </div>

                    {/* Step content card */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="glass-surface rounded-3xl max-w-2xl w-full mx-auto p-8 border border-twilight-border/40"
                        >
                            {/* ─── Step 1: Inbox Review ─── */}
                            {currentStep === 0 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-display font-semibold text-twilight-text mb-2">
                                            Clear the Inbox
                                        </h2>
                                        <p className="text-[14px] text-twilight-text-muted leading-relaxed">
                                            {inboxItems.length > 0
                                                ? `You have ${inboxItems.length} item${inboxItems.length > 1 ? "s" : ""} to review. Turn open loops into tasks or dismiss them.`
                                                : "Your inbox is clear. Nothing to process right now."}
                                        </p>
                                    </div>
                                    {inboxItems.length > 0 ? (
                                        <div className="max-h-[300px] overflow-y-auto -mx-2 px-2">
                                            {inboxItems.map((item: any) => (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between py-3 border-b border-twilight-border/30 last:border-b-0"
                                                >
                                                    <span className="text-[14px] text-twilight-text">{item.content || item.title}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-10 text-center text-twilight-text-muted/50 italic text-sm">
                                            All caught up
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ─── Step 2: Unscheduled Tasks ─── */}
                            {currentStep === 1 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-display font-semibold text-twilight-text mb-2">
                                            Unscheduled Tasks
                                        </h2>
                                        <p className="text-[14px] text-twilight-text-muted leading-relaxed">
                                            {unscheduledTasks.length > 0
                                                ? `${unscheduledTasks.length} task${unscheduledTasks.length > 1 ? "s" : ""} with no date. Schedule them for this week or leave them for later.`
                                                : "All your tasks have dates assigned. Well done."}
                                        </p>
                                    </div>
                                    {unscheduledTasks.length > 0 ? (
                                        <div className="max-h-[300px] overflow-y-auto -mx-2 px-2">
                                            <TaskList
                                                tasks={unscheduledTasks}
                                                selectedTaskId={selectedTaskId}
                                                onSelectTask={(id) => setSelectedTaskId(id === selectedTaskId ? null : id)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-10 text-center text-twilight-text-muted/50 italic text-sm">
                                            Nothing unscheduled
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ─── Step 3: Waiting Tasks ─── */}
                            {currentStep === 2 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-display font-semibold text-twilight-text mb-2">
                                            Move Waiting Tasks
                                        </h2>
                                        <p className="text-[14px] text-twilight-text-muted leading-relaxed">
                                            {waitingTasks.length > 0
                                                ? `${waitingTasks.length} task${waitingTasks.length > 1 ? "s are" : " is"} waiting. Check if any are ready to become active or should be archived.`
                                                : "No tasks are in a waiting state."}
                                        </p>
                                    </div>
                                    {waitingTasks.length > 0 ? (
                                        <div className="max-h-[300px] overflow-y-auto -mx-2 px-2">
                                            <TaskList
                                                tasks={waitingTasks}
                                                selectedTaskId={selectedTaskId}
                                                onSelectTask={(id) => setSelectedTaskId(id === selectedTaskId ? null : id)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-10 text-center text-twilight-text-muted/50 italic text-sm">
                                            Nothing waiting
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ─── Step 4: Habit Check-in ─── */}
                            {currentStep === 3 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-display font-semibold text-twilight-text mb-2">
                                            Habit Check-in
                                        </h2>
                                    </div>
                                    <div className="py-6 text-center">
                                        {habitStats.total > 0 ? (
                                            <p className="text-[16px] text-twilight-text-soft leading-relaxed max-w-md mx-auto">
                                                You completed <span className="text-lantern font-semibold">{habitStats.completed}</span> of <span className="text-twilight-text font-semibold">{habitStats.total}</span> habits this week.
                                                {habitStats.completed === habitStats.total && " Perfect streak — keep it going."}
                                                {habitStats.completed > 0 && habitStats.completed < habitStats.total && " Not bad. Consider what got in the way."}
                                                {habitStats.completed === 0 && " A fresh start awaits this week."}
                                            </p>
                                        ) : (
                                            <p className="text-[14px] text-twilight-text-muted italic">
                                                No habits tracked yet. Visit the Habits page to create some.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ─── Step 5: Week Ready ─── */}
                            {currentStep === 4 && (
                                <div className="space-y-6 text-center py-6">
                                    <div className="w-16 h-16 rounded-full bg-lantern/15 border border-lantern/30 flex items-center justify-center mx-auto mb-4 glow-lantern">
                                        <Sparkles size={28} className="text-lantern" />
                                    </div>
                                    <h2 className="text-3xl font-display font-semibold text-twilight-text">
                                        You're all set.
                                    </h2>
                                    <p className="text-[15px] text-twilight-text-muted max-w-sm mx-auto leading-relaxed">
                                        {scheduledCount} task{scheduledCount !== 1 ? "s" : ""} scheduled,{" "}
                                        {inboxItems.length} in inbox,{" "}
                                        {waitingTasks.length} waiting.
                                    </p>
                                    <button
                                        onClick={() => navigate("/")}
                                        className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-lantern text-twilight font-display font-semibold text-sm rounded-xl hover:bg-lantern/90 transition-colors glow-lantern"
                                    >
                                        Start your week
                                        <ArrowRight size={16} />
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Navigation */}
                    {currentStep < 4 && (
                        <div className="flex items-center gap-4 mt-8">
                            <button
                                onClick={handlePrev}
                                disabled={currentStep === 0}
                                className="px-4 py-2 flex items-center gap-2 text-sm text-twilight-text-soft hover:text-twilight-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ArrowLeft size={16} />
                                Back
                            </button>
                            <button
                                onClick={handleNext}
                                className="px-6 py-2.5 bg-lantern/15 text-lantern font-medium text-sm rounded-xl hover:bg-lantern/25 transition-colors flex items-center gap-2 border border-lantern/20"
                            >
                                Continue
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
