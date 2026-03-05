import React, { useState, useRef, useEffect } from "react";
import {
    Sun, Sunset, CalendarClock, ChevronLeft, ChevronRight, X, Clock,
    Calendar as CalendarIcon, CalendarRange
} from "lucide-react";
import * as Popover from "../primitives/Popover";
import * as Tooltip from "../primitives/Tooltip";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { TimePickerInput } from "./TimePickerInput";
import { RecurrencePicker } from "./RecurrencePicker";
import { toISODate, parseLocalDate, addDays } from "../../lib/utils/date-format";

interface DeadlinePickerPopoverProps {
    children: React.ReactNode;
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd?: string | null;
    recurrenceRule: string | null;
    onChange: (updates: {
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd?: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }) => void;
}

type PickerMode = "deadline" | "duration";

function getNextMonday(): Date {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    return addDays(d, daysUntilMonday);
}

const QUICK_ACTIONS = [
    { id: "today", icon: Sun, label: "Today" },
    { id: "tomorrow", icon: Sunset, label: "Tomorrow" },
    { id: "next_week", icon: CalendarClock, label: "Next Monday" },
] as const;

export const DeadlinePickerPopover: React.FC<DeadlinePickerPopoverProps> = ({
    children,
    dueDate,
    scheduledStart,
    scheduledEnd,
    recurrenceRule,
    onChange,
}) => {
    const initialDate = scheduledStart ? parseLocalDate(scheduledStart) : (dueDate ? parseLocalDate(dueDate) : new Date());
    const [viewDate, setViewDate] = useState(initialDate);
    const [selectedDate, setSelectedDate] = useState(dueDate ?? toISODate(initialDate));
    const [rangeEndDate, setRangeEndDate] = useState<string | null>(scheduledEnd ?? null);
    const [showTime, setShowTime] = useState(!!scheduledStart);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<PickerMode>("deadline");

    // For duration mode: track which click (first = start, second = end)
    const [rangeClickStep, setRangeClickStep] = useState<"start" | "end">("start");

    const handleMonthChange = (offset: number) => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
    };

    const handleSelectDate = (day: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        const iso = toISODate(newDate);

        if (mode === "duration") {
            if (rangeClickStep === "start") {
                setSelectedDate(iso);
                setRangeEndDate(null);
                setRangeClickStep("end");
                onChange({
                    dueDate: iso,
                    scheduledStart: showTime ? new Date(new Date(iso).setHours(9, 0, 0, 0)).toISOString() : null,
                    scheduledEnd: null,
                    recurrenceRule,
                    isAllDay: !showTime,
                });
            } else {
                // Ensure end >= start
                const startD = new Date(selectedDate);
                const endD = new Date(iso);
                if (endD < startD) {
                    // Swap
                    setRangeEndDate(selectedDate);
                    setSelectedDate(iso);
                    onChange({
                        dueDate: iso,
                        scheduledStart: showTime ? new Date(new Date(iso).setHours(9, 0, 0, 0)).toISOString() : null,
                        scheduledEnd: selectedDate,
                        recurrenceRule,
                        isAllDay: !showTime,
                    });
                } else {
                    setRangeEndDate(iso);
                    onChange({
                        dueDate: selectedDate,
                        scheduledStart: showTime ? new Date(new Date(selectedDate).setHours(9, 0, 0, 0)).toISOString() : null,
                        scheduledEnd: iso,
                        recurrenceRule,
                        isAllDay: !showTime,
                    });
                }
                setRangeClickStep("start");
            }
        } else {
            setSelectedDate(iso);
            const finalDate = new Date(newDate);
            if (scheduledStart) {
                const s = new Date(scheduledStart);
                finalDate.setHours(s.getHours(), s.getMinutes(), 0, 0);
            } else {
                finalDate.setHours(9, 0, 0, 0);
            }
            onChange({
                dueDate: iso,
                scheduledStart: showTime ? finalDate.toISOString() : null,
                scheduledEnd: null,
                recurrenceRule,
                isAllDay: !showTime,
            });
        }
    };

    const handleQuickAction = (preset: "today" | "tomorrow" | "next_week") => {
        const now = new Date();
        let target = new Date();
        if (preset === "tomorrow") target.setDate(now.getDate() + 1);
        if (preset === "next_week") target = getNextMonday();

        const iso = toISODate(target);
        setSelectedDate(iso);
        setViewDate(target);
        setRangeEndDate(null);
        setRangeClickStep("start");

        onChange({
            dueDate: iso,
            scheduledStart: showTime ? new Date(target.setHours(9, 0, 0, 0)).toISOString() : null,
            scheduledEnd: null,
            recurrenceRule,
            isAllDay: !showTime,
        });
    };

    const getActivePreset = (): string => {
        const todayIso = toISODate(new Date());
        const tomorrowDate = addDays(new Date(), 1);
        const tomorrowIso = toISODate(tomorrowDate);
        const nextMondayIso = toISODate(getNextMonday());
        if (selectedDate === todayIso) return "today";
        if (selectedDate === tomorrowIso) return "tomorrow";
        if (selectedDate === nextMondayIso) return "next_week";
        return "";
    };

    const handleTimeChange = (timeIso: string) => {
        const t = new Date(timeIso);
        const d = new Date(selectedDate);
        d.setHours(t.getHours(), t.getMinutes(), 0, 0);
        onChange({
            dueDate: selectedDate,
            scheduledStart: d.toISOString(),
            scheduledEnd: rangeEndDate,
            recurrenceRule,
            isAllDay: false,
        });
    };

    const clearDeadline = () => {
        onChange({
            dueDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            recurrenceRule: null,
            isAllDay: true,
        });
        setRangeEndDate(null);
        setRangeClickStep("start");
        setOpen(false);
    };

    const activePreset = getActivePreset();

    // Compute a "range" set for the grid to highlight
    const datesWithRange = new Set<number>();
    if (mode === "duration" && selectedDate && rangeEndDate) {
        const start = new Date(selectedDate);
        const end = new Date(rangeEndDate);
        const cur = new Date(start);
        while (cur <= end) {
            if (cur.getFullYear() === viewDate.getFullYear() && cur.getMonth() === viewDate.getMonth()) {
                datesWithRange.add(cur.getDate());
            }
            cur.setDate(cur.getDate() + 1);
        }
    }

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>{children}</Popover.Trigger>
            <Popover.Content
                className="w-[300px] p-0 overflow-hidden"
                side="bottom"
                align="start"
                role="dialog"
                aria-label="Deadline picker"
            >
                {/* Mode toggle */}
                <div className="flex items-center gap-1 p-2 border-b border-twilight-border" role="tablist" aria-label="Picker mode">
                    <button
                        role="tab"
                        aria-selected={mode === "deadline"}
                        onClick={() => {
                            setMode("deadline");
                            setRangeEndDate(null);
                            setRangeClickStep("start");
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium transition-colors ${mode === "deadline"
                                ? "bg-lantern/12 text-lantern"
                                : "text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04]"
                            }`}
                    >
                        <CalendarIcon size={13} aria-hidden="true" />
                        Deadline
                    </button>
                    <button
                        role="tab"
                        aria-selected={mode === "duration"}
                        onClick={() => {
                            setMode("duration");
                            setRangeClickStep("start");
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium transition-colors ${mode === "duration"
                                ? "bg-lantern/12 text-lantern"
                                : "text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04]"
                            }`}
                    >
                        <CalendarRange size={13} aria-hidden="true" />
                        Duration
                    </button>
                </div>

                {/* Quick actions — icon only with tooltips */}
                <div className="flex items-center justify-center gap-1 px-3 pt-3 pb-1" role="group" aria-label="Quick date presets">
                    {QUICK_ACTIONS.map(({ id, icon: Icon, label }) => {
                        const isActive = activePreset === id;
                        return (
                            <Tooltip.Root key={id}>
                                <Tooltip.Trigger asChild>
                                    <button
                                        onClick={() => handleQuickAction(id)}
                                        aria-label={label}
                                        aria-pressed={isActive}
                                        className={`
                                            w-9 h-9 rounded-xl flex items-center justify-center transition-colors
                                            ${isActive
                                                ? "bg-lantern/12 text-lantern"
                                                : "text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.06]"
                                            }
                                        `}
                                    >
                                        <Icon size={16} aria-hidden="true" />
                                    </button>
                                </Tooltip.Trigger>
                                <Tooltip.Content side="bottom">{label}</Tooltip.Content>
                            </Tooltip.Root>
                        );
                    })}
                </div>

                {/* Month navigator */}
                <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[12px] font-semibold text-twilight-text">
                        {viewDate.toLocaleString("default", { month: "long", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => handleMonthChange(-1)}
                            aria-label="Previous month"
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-twilight-text-muted hover:text-twilight-text transition-colors"
                        >
                            <ChevronLeft size={15} aria-hidden="true" />
                        </button>
                        <button
                            onClick={() => handleMonthChange(1)}
                            aria-label="Next month"
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-twilight-text-muted hover:text-twilight-text transition-colors"
                        >
                            <ChevronRight size={15} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Calendar grid */}
                <div className="px-3 pb-2">
                    <CalendarGrid
                        year={viewDate.getFullYear()}
                        month={viewDate.getMonth()}
                        selectedDate={selectedDate}
                        datesWithTasks={datesWithRange}
                        onSelectDate={handleSelectDate}
                        variant="compact"
                    />
                    {mode === "duration" && (
                        <p className="text-[10px] text-twilight-text-muted/90 text-center mt-1.5">
                            {rangeClickStep === "start" ? "Click a start date" : "Click an end date"}
                        </p>
                    )}
                </div>

                <div className="border-t border-twilight-border px-3 pt-2 pb-3 space-y-2">
                    {/* Time toggle */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => {
                                const next = !showTime;
                                setShowTime(next);
                                if (!next) {
                                    onChange({
                                        dueDate: selectedDate,
                                        scheduledStart: null,
                                        scheduledEnd: rangeEndDate,
                                        recurrenceRule,
                                        isAllDay: true,
                                    });
                                }
                            }}
                            aria-label={showTime ? "Remove time" : "Add time"}
                            aria-pressed={showTime}
                            className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider transition-colors ${showTime ? "text-lantern" : "text-twilight-text-muted/90 hover:text-twilight-text-muted"
                                }`}
                        >
                            <Clock size={11} aria-hidden="true" />
                            {showTime ? "Time set" : "Add time"}
                        </button>
                        {showTime && (
                            <TimePickerInput value={scheduledStart} onChange={handleTimeChange} />
                        )}
                    </div>

                    {/* Recurrence */}
                    <RecurrencePicker
                        value={recurrenceRule}
                        onChange={(r) => onChange({
                            dueDate: selectedDate,
                            scheduledStart,
                            scheduledEnd: rangeEndDate,
                            recurrenceRule: r,
                            isAllDay: !showTime,
                        })}
                    />

                    {/* Clear */}
                    <button
                        onClick={clearDeadline}
                        aria-label="Clear deadline"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-twilight-border py-1.5 text-xs text-twilight-text-muted hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors font-medium"
                    >
                        <X size={13} aria-hidden="true" />
                        Clear
                    </button>
                </div>
            </Popover.Content>
        </Popover.Root>
    );
};

