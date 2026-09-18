import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as Popover from "../primitives/Popover";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { parseLocalDate, toISODate } from "../../lib/utils/date-format";

/**
 * Quiet date-only picker for timetable block boundaries (series start / series
 * end). Deliberately stripped of the generic schedule surface's time row, quick
 * presets and recurrence controls — those have their own rows in the editor.
 */

interface DateOnlyPickerPopoverProps {
    children: React.ReactNode;
    /** Selected date as "YYYY-MM-DD", or null when unset (e.g. series runs forever). */
    value: string | null;
    onChange: (date: string | null) => void;
    /** Accessible name for the popover dialog, e.g. "Series start date". */
    label: string;
    /** When set, renders a quiet action that clears the value (e.g. "Never ends"). */
    clearLabel?: string;
}

export const DateOnlyPickerPopover: React.FC<DateOnlyPickerPopoverProps> = ({
    children,
    value,
    onChange,
    label,
    clearLabel,
}) => {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState(() => (value ? parseLocalDate(value) : new Date()));

    useEffect(() => {
        if (open) setViewDate(value ? parseLocalDate(value) : new Date());
    }, [open, value]);

    const handleSelect = (day: number) => {
        onChange(toISODate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day)));
        setOpen(false);
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>{children}</Popover.Trigger>
            <Popover.Content
                className="w-[280px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain p-0"
                side="bottom"
                align="start"
                role="dialog"
                aria-label={label}
            >
                <div className="flex items-center justify-between px-3 pb-1 pt-3">
                    <span className="text-[12px] font-semibold text-twilight-text">
                        {viewDate.toLocaleString("default", { month: "long", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                            aria-label="Previous month"
                            className="cursor-pointer rounded-lg p-1.5 text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <ChevronLeft size={15} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                            aria-label="Next month"
                            className="cursor-pointer rounded-lg p-1.5 text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <ChevronRight size={15} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="px-3 pb-3">
                    <CalendarGrid
                        year={viewDate.getFullYear()}
                        month={viewDate.getMonth()}
                        selectedDate={value ?? ""}
                        datesWithTasks={new Set<number>()}
                        onSelectDate={handleSelect}
                        variant="compact"
                    />
                </div>

                {clearLabel ? (
                    <div className="border-t border-twilight-border/40 px-3 py-2">
                        <button
                            type="button"
                            onClick={() => {
                                onChange(null);
                                setOpen(false);
                            }}
                            className="min-h-10 w-full cursor-pointer rounded-xl px-3 text-center text-[13px] text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            {clearLabel}
                        </button>
                    </div>
                ) : null}
            </Popover.Content>
        </Popover.Root>
    );
};
