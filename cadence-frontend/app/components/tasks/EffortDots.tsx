import type { EffortLevel } from "../../types/task";

interface EffortDotsProps {
    effort?: EffortLevel;
}

export function EffortDots({ effort }: EffortDotsProps) {
    if (!effort) return null;

    const tooltipText = effort === 1 ? "Low effort" : effort === 2 ? "Medium effort" : "High effort";

    return (
        <div
            className="flex items-center gap-0.5"
            title={tooltipText}
            aria-label={tooltipText}
        >
            <div className={`w-1.5 h-1.5 rounded-full ${effort >= 1 ? (effort === 1 ? "bg-twilight-text-muted/60" : effort === 2 ? "bg-lantern/50" : "bg-lantern/80") : ""}`} />
            {effort >= 2 && <div className={`w-1.5 h-1.5 rounded-full ${effort === 2 ? "bg-lantern/50" : "bg-lantern/80"}`} />}
            {effort >= 3 && <div className="w-1.5 h-1.5 rounded-full bg-lantern/80" />}
        </div>
    );
}
