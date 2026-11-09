import { ArrowLeft } from "lucide-react";
import { STEPS } from "../weekly-review/WeeklyResetSidebar";

export type CompactStepHeaderProps = { currentStep: number; onExit: () => void };

/** Without the sidebar: where you are in the reset, and the way out. */
export function CompactStepHeader({ currentStep, onExit }: CompactStepHeaderProps) {
    return (
        <div className="photo-shell-surface safe-top sticky top-0 z-20 border-b border-twilight-border bg-twilight-deep/75 px-4 py-3 backdrop-blur-xl">
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
                    onClick={onExit}
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
    );
}
