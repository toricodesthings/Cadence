import React from "react";
import { CalendarCheck, CalendarPlus, CalendarRange, CalendarSearch } from "lucide-react";
import { Tip } from "../primitives";

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
                <Tip key={id} label={label} side="bottom">
                    <button
                        type="button"
                        onClick={() => onSelect(id)}
                        className={`
								touch-target flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent transition-colors
								hover:bg-twilight-surface-hover
								${activePreset === id ? "bg-accent-primary/20 text-accent-primary border-accent-primary/30" : "text-twilight-text-muted"}
							`}
                        aria-label={label}
                    >
                        <Icon size={16} aria-hidden="true" />
                    </button>
                </Tip>
            ))}
        </div>
    );
};
