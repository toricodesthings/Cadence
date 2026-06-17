import type { EffortLevel } from "@cadence/contracts/task";
import { Tip } from "../primitives";

interface EffortDotsProps {
    effort?: EffortLevel;
}

export function EffortDots({ effort }: EffortDotsProps) {
    if (!effort) return null;

    const tooltipText = effort === 1 ? "Low effort" : effort === 2 ? "Medium effort" : "High effort";

    return (
        <Tip label={tooltipText} side="top">
            <div
                className="flex items-center gap-0.5"
                aria-label={tooltipText}
            >
                <div className={`w-1.5 h-1.5 rounded-full ${effort >= 1 ? (effort === 1 ? "bg-twilight-text-muted/60" : effort === 2 ? "bg-accent-primary/50" : "bg-accent-primary/80") : ""}`} />
                {effort >= 2 && <div className={`w-1.5 h-1.5 rounded-full ${effort === 2 ? "bg-accent-primary/50" : "bg-accent-primary/80"}`} />}
                {effort >= 3 && <div className="w-1.5 h-1.5 rounded-full bg-accent-primary/80" />}
            </div>
        </Tip>
    );
}
