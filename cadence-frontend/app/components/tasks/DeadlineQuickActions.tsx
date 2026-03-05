import React from "react";
import { CalendarCheck, CalendarPlus, CalendarRange, CalendarSearch } from "lucide-react";
import * as Tooltip from "../primitives/Tooltip";

interface DeadlineQuickActionsProps {
    onSelect: (preset: "today" | "tomorrow" | "next_week" | "custom") => void;
    activePreset?: string;
}

export const DeadlineQuickActions: React.FC<DeadlineQuickActionsProps> = ({
    onSelect,
    activePreset,
}) => {
    const actions = [
        { id: "today", icon: CalendarCheck, label: "Today" },
        { id: "tomorrow", icon: CalendarPlus, label: "Tomorrow" },
        { id: "next_week", icon: CalendarRange, label: "Next week" },
        { id: "custom", icon: CalendarSearch, label: "Pick a date" },
    ] as const;

    return (
        <div className="flex items-center gap-1 p-1">
            {actions.map(({ id, icon: Icon, label }) => (
                <Tooltip.Root key={id}>
                    <Tooltip.Trigger asChild>
                        <button
                            onClick={() => onSelect(id)}
                            className={`
								flex h-8 w-8 items-center justify-center rounded-xl transition-colors
								hover:bg-twilight-surface-hover
								${activePreset === id ? "bg-lantern/20 text-lantern border border-lantern/30" : "text-twilight-text-muted"}
							`}
                            aria-label={label}
                        >
                            <Icon size={16} />
                        </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom">{label}</Tooltip.Content>
                </Tooltip.Root>
            ))}
        </div>
    );
};
