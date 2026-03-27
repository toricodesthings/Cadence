import React from "react";
import { Minus, ArrowDown, ArrowRight, ArrowUp, AlertCircle } from "lucide-react";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import type { TaskPriority } from "../../types/task";
import * as Tooltip from "../primitives/Tooltip";

interface PriorityPickerProps {
    currentPriority: TaskPriority;
    onSelect: (priority: TaskPriority) => void;
    compact?: boolean;
}

const icons = {
    0: Minus,
    1: ArrowDown,
    2: ArrowRight,
    3: ArrowUp,
    4: AlertCircle,
};

export const PriorityPicker: React.FC<PriorityPickerProps> = ({
    currentPriority,
    onSelect,
    compact = false,
}) => {
    const priorities = [0, 1, 2, 3, 4] as const;

    return (
        <div className={`flex w-full flex-col gap-2 ${compact ? "" : "p-2"}`}>
            {!compact && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-twilight-text-muted/90">
                    Priority
                </span>
            )}
            <div className="grid w-full grid-cols-5 gap-1">
                {priorities.map((p) => {
                    const config = PRIORITY_CONFIG[p];
                    const Icon = icons[p];
                    const isActive = currentPriority === p;

                    return (
                        <Tooltip.Root key={p}>
                            <Tooltip.Trigger asChild>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelect(p);
                                    }}
                                    className={`
									group flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border transition-[background-color,border-color] duration-200
									${isActive
                                            ? "border-accent-primary bg-accent-primary/10 "
                                            : "border-twilight-border bg-white/[0.04] hover:border-twilight-text-muted/30"
                                        }
									`}
                                    aria-label={config.label}
                                >
                                    <Icon
                                        size={16}
                                        className={`transition-colors ${isActive ? config.color : "text-twilight-text-muted group-hover:text-twilight-text"
                                            }`}
                                    />
                                </button>
                            </Tooltip.Trigger>
                            <Tooltip.Content side="bottom" className="text-xs">
                                {config.label}
                            </Tooltip.Content>
                        </Tooltip.Root>
                    );
                })}
            </div>
        </div>
    );
};
