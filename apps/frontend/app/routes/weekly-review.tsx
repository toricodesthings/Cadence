import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { AnimatePresence, motion } from "framer-motion";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useDeviceValue } from "../hooks/ui/use-device-flag";
import { useKeyboardInset } from "../hooks/ui/use-keyboard-inset";
import { useReducedMotionSetting } from "../hooks/ui/use-reduced-motion";
import { useWeeklyReviewActions } from "../hooks/core/use-weekly-review-actions";
import { useWeekRoom } from "../hooks/core/use-week-room";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { useResetSuggestions } from "../hooks/ai/use-reset-suggestions";
import { usePlanningOffers } from "../hooks/ai/use-planning-offers";
import { CompactStepHeader } from "../components/weekly-review/CompactStepHeader";
import { StepFooter } from "../components/weekly-review/StepShell";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { RESET_CHAT_KEY } from "../components/weekly-review/ResetChat";
import { IntroStep } from "../components/weekly-review/steps/IntroStep";
import { InboxStep } from "../components/weekly-review/steps/InboxStep";
import { BatchBar, StabilizeStep } from "../components/weekly-review/steps/StabilizeStep";
import { HabitsStep } from "../components/weekly-review/steps/HabitsStep";
import { HuddleStep } from "../components/weekly-review/steps/HuddleStep";
import { ReadyStep } from "../components/weekly-review/steps/ReadyStep";
import { WeeklyResetSidebar, STEPS } from "../components/weekly-review/WeeklyResetSidebar";
import { SPRINGS, slideVariants } from "../lib/constants/motion";
import { trackUsageEvent } from "../lib/api/track-event";
import { returnPath } from "../lib/resume-route";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { Task } from "@cadence/contracts/task";

const STEP_STORAGE_KEY = "cadence-weekly-reset-step";
const SLIDE_PX = 40;

export default function WeeklyReview() {
    const shell = useShellMode();
    const navigate = useNavigate();
    const showSidebar = shell.isWide || shell.isLaptop;
    const reduced = useReducedMotionSetting();

    // The step survives leaving and coming back.
    const [savedStep, saveStep] = useDeviceValue(STEP_STORAGE_KEY);
    const [, saveChat] = useDeviceValue(RESET_CHAT_KEY);
    const currentStep = Math.max(0, STEPS.findIndex((_, i) => String(i) === savedStep));
    const [direction, setDirection] = useState(1);
    const goTo = (step: number) => {
        const next = Math.min(Math.max(step, 0), STEPS.length - 1);
        setDirection(next >= currentStep ? 1 : -1);
        setPanel(null);
        saveStep(String(next));
    };

    const review = useWeeklyReviewActions();
    const { unscheduledTasks, visibleWaiting, habitReviewItems, applyInstruction, inboxItems } = review;
    const { room, dayFor } = useWeekRoom();

    // Rows picked for one typed change; a failed one stays picked so a retry touches only it.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const toggleSelected = (id: string) => setSelectedIds((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
    const workRows: Task[] = [...unscheduledTasks, ...visibleWaiting];
    const offers = usePlanningOffers(workRows);
    const selectedTasks = workRows.filter((t) => selectedIds.has(t.id));
    const applyToSelected = async (patch: InstructionPatch) => {
        const result = await applyInstruction(selectedTasks, patch, `Updated ${selectedTasks.length} task${selectedTasks.length === 1 ? "" : "s"}`);
        setSelectedIds(new Set(result.failed));
    };
    const applyToOne = async (task: Task, patch: InstructionPatch) => {
        await applyInstruction([task], patch, "Updated");
    };

    // The model's guesses, asked once per step per visit after the step shows; with none, each row keeps Today.
    const captureGuesses = useResetSuggestions("captures", inboxItems.map((i) => i.id), currentStep === 1);
    const looseGuesses = useResetSuggestions("loose_ends", workRows.map((t) => t.id), currentStep === 2);

    const [reviewedHabitIds, setReviewedHabitIds] = useState<Set<string>>(new Set());
    const unreviewedHabits = habitReviewItems.filter((h) => !reviewedHabitIds.has(h.id));
    const markHabitReviewed = (id: string) => setReviewedHabitIds((prev) => new Set(prev).add(id));
    // A routine (Routines' Edit, a day's routine) or a task (a day's row) opens its own panel here, beside the step
    // (over it below wide), so the reset never leaves.
    const [panel, setPanel] = useState<{ kind: "habit" | "task"; id: string } | null>(null);
    const panelHabit = panel?.kind === "habit" ? review.habits.find((h) => h.id === panel.id) ?? null : null;
    const closePanel = () => setPanel(null);
    const panelBody = panel?.kind === "task" ? <EditSidePanel kind="task" taskId={panel.id} onClose={closePanel} />
        : panelHabit ? <EditSidePanel kind="habit" habit={panelHabit} onClose={closePanel} onOpenInRoutines={() => navigate(`/routines?routine=${panelHabit.id}`)} />
            : null;

    const counts = [null, inboxItems.length, workRows.length, unreviewedHabits.length, null, null] as const;

    const [titleVisible, setTitleVisible] = useState(true);
    const onTitleVisible = useCallback((visible: boolean) => setTitleVisible(visible), []);
    // With the keyboard up on touch the footer steps aside; the composer rides the keys.
    const keyboardOpen = useKeyboardInset(shell.isTouch).inset > 0;

    const handleExit = () => {
        trackUsageEvent("weekly_reset.abandoned", { route: "weekly-review", outcome: `step_${currentStep}` });
        navigate(returnPath());
    };
    const handleFinish = () => {
        trackUsageEvent("weekly_reset.completed", { route: "weekly-review" });
        saveStep(null);
        saveChat(null);
        navigate(returnPath());
    };

    useKeyboardShortcuts({
        onNextStep: () => goTo(currentStep + 1),
        onPrevStep: () => goTo(currentStep - 1),
        onExitResume: handleExit,
    });

    const nav = { currentStep, counts, onStep: goTo };
    const step = (() => {
        switch (currentStep) {
            case 0: return <IntroStep counts={{ captures: inboxItems.length, looseEnds: workRows.length, routines: habitReviewItems.length }} onNext={() => goTo(1)} onTitleVisible={onTitleVisible} />;
            case 1: return <InboxStep review={review} guesses={captureGuesses} dayFor={dayFor} onTitleVisible={onTitleVisible} />;
            case 2: return <StabilizeStep review={review} rows={{ offers, selectedIds, toggleSelected, applyToOne, guesses: looseGuesses, dayFor }} onTitleVisible={onTitleVisible} />;
            case 3: return <HabitsStep habits={unreviewedHabits} anyHabits={habitReviewItems.length > 0} pauseHabit={review.pauseHabit} onReviewed={markHabitReviewed} onEdit={(id) => setPanel({ kind: "habit", id })} onTitleVisible={onTitleVisible} />;
            case 4: return <HuddleStep onTitleVisible={onTitleVisible} />;
            default: return <ReadyStep room={room} onOpenTask={(id) => setPanel({ kind: "task", id })} onOpenRoutine={(id) => setPanel({ kind: "habit", id })} onTitleVisible={onTitleVisible} />;
        }
    })();
    const custom = { direction, distance: reduced ? 0 : SLIDE_PX };

    return (
        <MainLayout
            requireAuth
            hideContextualOrb
            customSidebar={showSidebar ? <WeeklyResetSidebar {...nav} compact={shell.isLaptop} onExit={handleExit} /> : undefined}
            hideHeader
            sidePanel={<EditSidePanelRail ariaLabel="Resize detail panel">{shell.isWide ? panelBody : null}</EditSidePanelRail>}
            sidePanelActive={shell.isWide && Boolean(panelBody)}
            sidePanelLabel={panel?.kind === "task" ? "Task" : "Routine"}
            onCloseSidePanel={closePanel}
        >
            {!shell.isWide && panelBody ? (
                <ResponsiveOverlayPanel ariaLabel={panel?.kind === "task" ? "Task details" : "Routine details"} open onClose={closePanel} mode="peek">
                    {panelBody}
                </ResponsiveOverlayPanel>
            ) : null}
            <div className="relative flex h-full min-h-0 flex-col">
                {!showSidebar && (
                    <CompactStepHeader {...nav} showTitle={!titleVisible}
                        onBack={currentStep === 0 ? handleExit : () => goTo(currentStep - 1)} onExit={handleExit} />
                )}

                <div className="relative z-10 flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 pt-6 sm:px-8 md:px-12 md:pt-10">
                    <AnimatePresence mode="popLayout" initial={false} custom={custom}>
                        <motion.div
                            key={currentStep}
                            custom={custom}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={SPRINGS.GLIDE}
                            className={currentStep === 0 ? "my-auto pb-8" : "flex flex-1 flex-col pb-8"}
                        >
                            {step}
                        </motion.div>
                    </AnimatePresence>
                    {/* Welcome's own button is its Next, so it has no footer. */}
                    {currentStep > 0 && !keyboardOpen ? (
                        <StepFooter step={currentStep} onBack={() => goTo(currentStep - 1)} onNext={() => goTo(currentStep + 1)} onDone={handleFinish}>
                            {currentStep === 2 && selectedTasks.length > 0 ? (
                                <BatchBar count={selectedTasks.length} onApply={applyToSelected} onClear={() => setSelectedIds(new Set())} />
                            ) : undefined}
                        </StepFooter>
                    ) : null}
                </div>
            </div>
        </MainLayout>
    );
}
