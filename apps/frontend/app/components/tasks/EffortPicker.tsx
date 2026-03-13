import React from "react";
import { Minus } from "lucide-react";
import * as Tooltip from "../primitives/Tooltip";
import type { EffortLevel } from "../../types/task";

interface EffortPickerProps {
    currentEffort: EffortLevel;
    onSelect: (effort: EffortLevel) => void;
}

const EFFORT_OPTIONS: { value: EffortLevel; label: string; dots: number }[] = [
    { value: null, label: "None", dots: 0 },
    { value: 1, label: "Low effort", dots: 1 },
    { value: 2, label: "Medium effort", dots: 2 },
    { value: 3, label: "High effort", dots: 3 },
];

const DOT_COLORS: Record<number, string> = {
    1: "bg-twilight-text-muted/60",
    2: "bg-lantern/50",
    3: "bg-lantern/80",
};

export const EffortPicker: React.FC<EffortPickerProps> = ({ currentEffort, onSelect }) => {
    return (
        <div className="flex flex-col gap-2 p-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-twilight-text-muted/90">
                Effort
            </span>
            <div className="flex items-center gap-1">
                {EFFORT_OPTIONS.map((opt) => {
                    const isActive = currentEffort === opt.value;
                    return (
                        <Tooltip.Root key={String(opt.value)}>
                            <Tooltip.Trigger asChild>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelect(opt.value);
                                    }}
                                    className={`
                                        group flex h-9 w-9 items-center justify-center rounded-lg border transition-[background-color,border-color] duration-200
                                        ${isActive
                                            ? "border-lantern bg-lantern/10"
                                            : "border-twilight-border bg-white/[0.04] hover:border-twilight-text-muted/30"
                                        }
                                    `}
                                    aria-label={opt.label}
                                >
                                    {opt.dots === 0 ? (
                                        <Minus
                                            size={16}
                                            className={`transition-colors ${isActive ? "text-twilight-text" : "text-twilight-text-muted group-hover:text-twilight-text"}`}
                                        />
                                    ) : (
                                        <span className="flex items-center gap-[3px]">
                                            {Array.from({ length: opt.dots }, (_, i) => (
                                                <span
                                                    key={i}
                                                    className={`w-[5px] h-[5px] rounded-full transition-colors ${
                                                        isActive
                                                            ? DOT_COLORS[opt.dots]
                                                            : "bg-twilight-text-muted/40 group-hover:bg-twilight-text-muted/70"
                                                    }`}
                                                />
                                            ))}
                                        </span>
                                    )}
                                </button>
                            </Tooltip.Trigger>
                            <Tooltip.Content side="bottom" className="text-xs">
                                {opt.label}
                            </Tooltip.Content>
                        </Tooltip.Root>
                    );
                })}
            </div>
        </div>
    );
};
