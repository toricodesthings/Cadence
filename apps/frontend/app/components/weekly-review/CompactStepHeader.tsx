import { ChevronLeft, X } from "lucide-react";
import { Tip } from "../primitives";
import { PhonePageHeader } from "../layout/PageHeader";
import { STEPS, type StepNavProps } from "./WeeklyResetSidebar";

export function CompactStepHeader({
    currentStep,
    counts,
    onStep,
    onBack,
    onExit,
}: StepNavProps & {
    onBack: () => void;
    onExit: () => void;
}) {
    const count = counts[currentStep];
    const icon = "btn-icon touch-target cursor-pointer rounded-full text-twilight-text-soft hover:text-twilight-text";
    return (
        <PhonePageHeader
            title={
                currentStep === 0 ? null : (
                    <span className="flex items-center justify-center gap-2">
                        <span className="min-w-0 truncate">{STEPS[currentStep].title}</span>
                        {count ? (
                            <span className="shrink-0 rounded-full bg-accent-primary/12 px-2 py-0.5 text-[13px] font-semibold tabular-nums text-accent-primary">
                                {count}
                            </span>
                        ) : null}
                    </span>
                )
            }
            leading={
                <Tip label={currentStep === 0 ? "Save & exit" : "Back"} side="bottom">
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={currentStep === 0 ? "Save & exit" : "Back"}
                        className={icon}
                    >
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                </Tip>
            }
            actions={
                currentStep === 0 ? undefined : (
                    <Tip label="Save & exit" side="bottom">
                        <button type="button" onClick={onExit} aria-label="Save & exit" className={icon}>
                            <X size={18} aria-hidden="true" />
                        </button>
                    </Tip>
                )
            }
        >
            <ol className="flex gap-1.5" aria-label="Weekly Reset steps">
                {STEPS.map((step, i) => (
                    <li key={step.id} className="flex-1">
                        <button
                            type="button"
                            onClick={() => onStep(i)}
                            aria-current={i === currentStep ? "step" : undefined}
                            aria-label={counts[i] ? `${step.title}, ${counts[i]} left` : step.title}
                            className="glass-none block w-full cursor-pointer py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 rounded-full"
                        >
                            <span
                                className={`block h-1 rounded-full transition-colors ${
                                    i < currentStep
                                        ? "bg-accent-primary/50"
                                        : i === currentStep
                                          ? "bg-accent-primary"
                                          : "bg-twilight-border/40"
                                }`}
                            />
                        </button>
                    </li>
                ))}
            </ol>
        </PhonePageHeader>
    );
}
