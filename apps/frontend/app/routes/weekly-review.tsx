import { useState } from "react";
import { useNavigate } from "react-router";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { AnimatePresence } from "framer-motion";
import { today } from "../lib/utils/user-zone";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useDeviceValue } from "../hooks/ui/use-device-flag";
import { useWeeklyReviewActions } from "../hooks/core/use-weekly-review-actions";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { CompactStepHeader } from "../components/weekly-review/CompactStepHeader";
import { IntroStep } from "../components/weekly-review/steps/IntroStep";
import { InboxStep } from "../components/weekly-review/steps/InboxStep";
import { StabilizeStep } from "../components/weekly-review/steps/StabilizeStep";
import { HabitsStep } from "../components/weekly-review/steps/HabitsStep";
import { ReadyStep } from "../components/weekly-review/steps/ReadyStep";
import { WeeklyResetSidebar, STEPS } from "../components/weekly-review/WeeklyResetSidebar";
import { trackUsageEvent } from "../lib/api/track-event";
import { returnPath } from "../lib/resume-route";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { Task } from "@cadence/contracts/task";
import { usePlanningOffers } from "../hooks/ai/use-planning-offers";

const STEP_STORAGE_KEY = "cadence-weekly-reset-step";

export default function WeeklyReview() {
    const shell = useShellMode();
    const navigate = useNavigate();
    const showSidebar = shell.isWide || shell.isLaptop;

    // The step survives leaving and coming back.
    const [savedStep, saveStep] = useDeviceValue(STEP_STORAGE_KEY);
    const currentStep = Math.max(0, STEPS.findIndex((_, i) => String(i) === savedStep));
    const setCurrentStep = (step: number) => saveStep(String(step));


    const review = useWeeklyReviewActions(currentStep);
    const { unscheduledTasks, visibleWaiting, habitReviewItems, applyInstruction } = review;

    // Rows picked for one typed change; a failed one stays picked so a retry touches only it.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const toggleSelected = (id: string) => setSelectedIds((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
    const workRows: Task[] = [...unscheduledTasks, ...visibleWaiting];
    // One suggestion on the page at most: the first row, in the order shown, the server says may have one.
    const offers = usePlanningOffers(workRows);
    const selectedTasks = workRows.filter((t) => selectedIds.has(t.id));
    const applyToSelected = async (patch: InstructionPatch) => {
        const result = await applyInstruction(selectedTasks, patch, `Updated ${selectedTasks.length} task${selectedTasks.length === 1 ? "" : "s"}`);
        setSelectedIds(new Set(result.failed));
    };
    const applyToOne = async (task: Task, patch: InstructionPatch) => {
        await applyInstruction([task], patch, "Updated");
    };

    const [reviewedHabitIds, setReviewedHabitIds] = useState<Set<string>>(new Set());
    const unreviewedHabits = habitReviewItems.filter((h) => !reviewedHabitIds.has(h.id));

    const markHabitReviewed = (id: string) => {
        setReviewedHabitIds((prev) => new Set(prev).add(id));
    };

    const handleNext = () => setCurrentStep(Math.min(currentStep + 1, STEPS.length - 1));
    const handlePrev = () => setCurrentStep(Math.max(currentStep - 1, 0));
    const handleExit = () => {
        trackUsageEvent("weekly_reset.abandoned", { route: "weekly-review", outcome: `step_${currentStep}` });
        navigate(returnPath());
    };
    const handleFinish = () => {
        trackUsageEvent("weekly_reset.completed", { route: "weekly-review" });
        localStorage.setItem("cadence_last_weekly_reset", today());
        saveStep(null);
        navigate(returnPath());
    };

    useKeyboardShortcuts({
        onNextStep: handleNext,
        onPrevStep: handlePrev,
        onExitResume: handleExit,
    });

    return (
        <MainLayout
            requireAuth
            hideContextualOrb
            customSidebar={showSidebar ? <WeeklyResetSidebar currentStep={currentStep} compact={shell.isLaptop} onExit={handleExit} /> : undefined}
            hideHeader
        >
            <div className="relative flex h-full min-h-0 flex-col">
                {!showSidebar && <CompactStepHeader currentStep={currentStep} onExit={handleExit} />}

                <div className="z-10 flex flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-8 md:px-12">
                    <AnimatePresence mode="wait">
                        {currentStep === 0 && <IntroStep key="intro" onNext={handleNext} />}
                        {currentStep === 1 && <InboxStep key="inbox" review={review} onNext={handleNext} />}
                        {currentStep === 2 && (
                            <StabilizeStep
                                key="stabilize"
                                review={review}
                                rows={{ offers, selectedIds, toggleSelected, applyToOne }}
                                selectedTasks={selectedTasks}
                                onApplySelected={applyToSelected}
                                onClearSelected={() => setSelectedIds(new Set())}
                                onNext={handleNext}
                            />
                        )}
                        {currentStep === 3 && (
                            <HabitsStep
                                key="habits"
                                habits={unreviewedHabits}
                                anyHabits={habitReviewItems.length > 0}
                                pauseHabit={review.pauseHabit}
                                onReviewed={markHabitReviewed}
                                onNext={handleNext}
                            />
                        )}
                        {currentStep === 4 && <ReadyStep key="ready" dueSoonCount={review.dueSoonCount} onFinish={handleFinish} />}
                    </AnimatePresence>
                </div>
            </div>
        </MainLayout>
    );
}
