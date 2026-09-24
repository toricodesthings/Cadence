import React from "react";
import { Minus, type LucideIcon } from "lucide-react";
import { Tip } from "../primitives";
import type { EffortLevel } from "@cadence/contracts/task";
import { EFFORT_OPTIONS } from "./task-choice-options";

interface EffortPickerProps {
    currentEffort: EffortLevel;
    onSelect: (effort: EffortLevel) => void;
}

const EFFORT_CHOICES: { value: EffortLevel; label: string; icon: LucideIcon }[] = [
    { value: null, label: "None", icon: Minus },
    ...EFFORT_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} effort`, icon: o.icon })),
];

export const EffortPicker: React.FC<EffortPickerProps> = ({ currentEffort, onSelect }) => {
    return (
        <div className="flex w-full flex-col gap-2 p-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-twilight-text-muted/90">
                Effort
            </span>
            <div className="grid w-full grid-cols-4 gap-1">
                {EFFORT_CHOICES.map((opt) => {
                    const isActive = currentEffort === opt.value;
                    return (
                        <Tip key={String(opt.value)} label={opt.label} side="bottom">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(opt.value);
                                }}
                                className={`
                                        group flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border transition-[background-color,border-color] duration-200
                                        ${isActive
                                        ? "border-accent-primary bg-accent-primary/10"
                                        : "border-twilight-border bg-white/[0.04] hover:border-twilight-text-muted/30"
                                    }
                                    `}
                                aria-label={opt.label}
                            >
                                <opt.icon
                                    size={16}
                                    aria-hidden="true"
                                    className={`transition-colors ${isActive ? (opt.value ? "text-accent-primary" : "text-twilight-text") : "text-twilight-text-muted group-hover:text-twilight-text"}`}
                                />
                            </button>
                        </Tip>
                    );
                })}
            </div>
        </div>
    );
};
