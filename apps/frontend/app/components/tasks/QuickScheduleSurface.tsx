import { useEffect, useState } from "react";
import {
    Sun,
    Sunset,
    CalendarClock,
    X,
    Clock,
    Calendar as CalendarIcon,
    CalendarRange,
} from "lucide-react";
import { Tip, TimePicker } from "../primitives";
import { MonthCalendar } from "../shared/DatePicker";
import { RecurrencePicker } from "./RecurrencePicker";
import { addDays, fromTimeValue, parseLocalDate, toISODate, toTimeValue } from "../../lib/utils/date-format";

interface QuickScheduleSurfaceProps {
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd?: string | null;
    recurrenceRule: string | null;
    isOpen?: boolean;
    onChange: (updates: {
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd?: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }) => void;
    onRequestClose?: () => void;
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

const DEFAULT_TIME = "09:00";

/** "HH:mm" → ISO on the start date, rolling to the next day when the block crosses midnight. */
function toEndOnDate(startIso: string, time: string): string {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(startIso);
    d.setHours(h, m, 0, 0);
    if (d <= new Date(startIso)) d.setDate(d.getDate() + 1);
    return d.toISOString();
}

/** "HH:mm" + 1 hour (wraps past midnight). */
function plusOneHour(time: string): string {
    const [h, m] = time.split(":").map(Number);
    return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function QuickScheduleSurface({
    dueDate,
    scheduledStart,
    scheduledEnd,
    recurrenceRule,
    isOpen = true,
    onChange,
    onRequestClose,
}: QuickScheduleSurfaceProps) {
    const initialDate = scheduledStart ? parseLocalDate(scheduledStart) : (dueDate ? parseLocalDate(dueDate) : new Date());
    const [viewDate, setViewDate] = useState(initialDate);
    const [selectedDate, setSelectedDate] = useState(dueDate ?? toISODate(initialDate));
    const [rangeEndDate, setRangeEndDate] = useState<string | null>(scheduledEnd ?? null);
    const [showTime, setShowTime] = useState(Boolean(scheduledStart));
    const [endTimeValue, setEndTimeValue] = useState<string | null>(
        scheduledStart && scheduledEnd ? toTimeValue(scheduledEnd) : null,
    );
    const [mode, setMode] = useState<PickerMode>("deadline");
    const [rangeClickStep, setRangeClickStep] = useState<"start" | "end">("start");

    useEffect(() => {
        if (!isOpen) return;

        const nextInitialDate = scheduledStart ? parseLocalDate(scheduledStart) : (dueDate ? parseLocalDate(dueDate) : new Date());
        setViewDate(nextInitialDate);
        setSelectedDate(dueDate ?? toISODate(nextInitialDate));
        setRangeEndDate(scheduledEnd ?? null);
        setShowTime(Boolean(scheduledStart));
        setEndTimeValue(scheduledStart && scheduledEnd ? toTimeValue(scheduledEnd) : null);
        setRangeClickStep("start");
    }, [dueDate, isOpen, scheduledEnd, scheduledStart]);

    const startTimeValue = scheduledStart ? toTimeValue(scheduledStart) : DEFAULT_TIME;
    const startIsoFor = (dateOnly: string) => fromTimeValue(dateOnly, startTimeValue);

    const handleSelectDate = (iso: string) => {

        if (mode === "duration") {
            // Duration is always an all-day date span — times live on Deadline.
            if (rangeClickStep === "start") {
                setSelectedDate(iso);
                setRangeEndDate(null);
                setRangeClickStep("end");
                onChange({
                    dueDate: iso,
                    scheduledStart: null,
                    scheduledEnd: null,
                    recurrenceRule,
                    isAllDay: true,
                });
                return;
            }

            const startD = new Date(selectedDate);
            const endD = new Date(iso);

            if (endD < startD) {
                setRangeEndDate(selectedDate);
                setSelectedDate(iso);
                onChange({
                    dueDate: iso,
                    scheduledStart: null,
                    scheduledEnd: selectedDate,
                    recurrenceRule,
                    isAllDay: true,
                });
            } else {
                setRangeEndDate(iso);
                onChange({
                    dueDate: selectedDate,
                    scheduledStart: null,
                    scheduledEnd: iso,
                    recurrenceRule,
                    isAllDay: true,
                });
            }

            setRangeClickStep("start");
            return;
        }

        setSelectedDate(iso);
        const startIso = showTime ? startIsoFor(iso) : null;
        onChange({
            dueDate: iso,
            scheduledStart: startIso,
            scheduledEnd: startIso && endTimeValue ? toEndOnDate(startIso, endTimeValue) : null,
            recurrenceRule,
            isAllDay: !showTime,
        });
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

        const startIso = showTime ? startIsoFor(iso) : null;
        onChange({
            dueDate: iso,
            scheduledStart: startIso,
            scheduledEnd: startIso && endTimeValue ? toEndOnDate(startIso, endTimeValue) : null,
            recurrenceRule,
            isAllDay: !showTime,
        });
    };

    const getActivePreset = (): string => {
        const todayIso = toISODate(new Date());
        const tomorrowIso = toISODate(addDays(new Date(), 1));
        const nextMondayIso = toISODate(getNextMonday());
        if (selectedDate === todayIso) return "today";
        if (selectedDate === tomorrowIso) return "tomorrow";
        if (selectedDate === nextMondayIso) return "next_week";
        return "";
    };

    // The TimePicker commits on Enter/blur/pick — no debounce needed.
    const handleStartTimeChange = (time: string) => {
        const startIso = fromTimeValue(selectedDate, time);
        let endIso: string | null = null;
        if (endTimeValue) {
            const sameDayEnd = fromTimeValue(selectedDate, endTimeValue);
            // Keep a positive block: when the end would land at or before the
            // new start, bump it to start + 1 hour.
            endIso = new Date(sameDayEnd) > new Date(startIso)
                ? sameDayEnd
                : new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
            setEndTimeValue(toTimeValue(endIso));
        }
        onChange({
            dueDate: selectedDate,
            scheduledStart: startIso,
            scheduledEnd: endIso,
            recurrenceRule,
            isAllDay: false,
        });
    };

    const handleEndTimeChange = (time: string) => {
        const startIso = startIsoFor(selectedDate);
        setEndTimeValue(time);
        onChange({
            dueDate: selectedDate,
            scheduledStart: startIso,
            // An end at/before the start rolls to the next day (overnight block).
            scheduledEnd: toEndOnDate(startIso, time),
            recurrenceRule,
            isAllDay: false,
        });
    };

    const handleAddEnd = () => {
        const end = plusOneHour(startTimeValue);
        const startIso = startIsoFor(selectedDate);
        setEndTimeValue(end);
        onChange({
            dueDate: selectedDate,
            scheduledStart: startIso,
            scheduledEnd: toEndOnDate(startIso, end),
            recurrenceRule,
            isAllDay: false,
        });
    };

    const handleRemoveEnd = () => {
        setEndTimeValue(null);
        onChange({
            dueDate: selectedDate,
            scheduledStart,
            scheduledEnd: null,
            recurrenceRule,
            isAllDay: false,
        });
    };

    const clearDeadline = () => {
        const resetDate = new Date();
        onChange({
            dueDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            recurrenceRule: null,
            isAllDay: true,
        });
        setSelectedDate(toISODate(resetDate));
        setViewDate(resetDate);
        setRangeEndDate(null);
        setShowTime(false);
        setEndTimeValue(null);
        setRangeClickStep("start");
        onRequestClose?.();
    };

    const activePreset = getActivePreset();
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
        <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-1 border-b border-twilight-border/40 px-3 py-2" role="tablist" aria-label="Picker mode">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "deadline"}
                    onClick={() => {
                        setMode("deadline");
                        setRangeEndDate(null);
                        setRangeClickStep("start");
                    }}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                        mode === "deadline"
                            ? "bg-accent-primary/12 text-accent-primary"
                            : "text-twilight-text-muted hover:bg-white/[0.04] hover:text-twilight-text-soft"
                    }`}
                >
                    <span className="inline-flex items-center gap-1.5">
                        <CalendarIcon size={13} aria-hidden="true" />
                        Deadline
                    </span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "duration"}
                    onClick={() => {
                        setMode("duration");
                        setRangeClickStep("start");
                        // Duration is all-day: drop any time the Deadline tab had.
                        if (showTime || scheduledStart) {
                            setShowTime(false);
                            setEndTimeValue(null);
                            onChange({
                                dueDate: selectedDate,
                                scheduledStart: null,
                                scheduledEnd: rangeEndDate ? toISODate(new Date(rangeEndDate)) : null,
                                recurrenceRule,
                                isAllDay: true,
                            });
                        }
                    }}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                        mode === "duration"
                            ? "bg-accent-primary/12 text-accent-primary"
                            : "text-twilight-text-muted hover:bg-white/[0.04] hover:text-twilight-text-soft"
                    }`}
                >
                    <span className="inline-flex items-center gap-1.5">
                        <CalendarRange size={13} aria-hidden="true" />
                        Duration
                    </span>
                </button>
            </div>

            <div className="flex items-center justify-center gap-1 px-3 pb-1 pt-3" role="group" aria-label="Quick date presets">
                {QUICK_ACTIONS.map(({ id, icon: Icon, label }) => {
                    const isActive = activePreset === id;

                    return (
                        <Tip key={id} label={label} side="bottom">
                            <button
                                type="button"
                                onClick={() => handleQuickAction(id)}
                                aria-label={label}
                                aria-pressed={isActive}
                                className={`touch-target flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                                    isActive
                                        ? "bg-accent-primary/12 text-accent-primary"
                                        : "text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text-soft"
                                }`}
                            >
                                <Icon size={16} aria-hidden="true" />
                            </button>
                        </Tip>
                    );
                })}
            </div>

            <MonthCalendar
                viewDate={viewDate}
                onViewDateChange={setViewDate}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                marked={datesWithRange}
            />
            {mode === "duration" ? (
                <p className="-mt-1.5 px-3 pb-2 text-center text-[10px] text-twilight-text-muted/90">
                    {rangeClickStep === "start" ? "Pick a start date" : "Pick an end date"}
                </p>
            ) : null}

            <div className="space-y-2 border-t border-twilight-border/40 px-3 pb-3 pt-2">
                {mode === "deadline" ? (
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => {
                                const next = !showTime;
                                setShowTime(next);
                                if (!next) {
                                    setEndTimeValue(null);
                                    onChange({
                                        dueDate: selectedDate,
                                        scheduledStart: null,
                                        scheduledEnd: null,
                                        recurrenceRule,
                                        isAllDay: true,
                                    });
                                }
                            }}
                            aria-label={showTime ? "Remove time" : "Add time"}
                            aria-pressed={showTime}
                            className={`inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider ${
                                showTime ? "text-accent-primary" : "text-twilight-text-muted/90 hover:text-twilight-text-muted"
                            }`}
                        >
                            <Clock size={11} aria-hidden="true" />
                            {showTime ? "Time set" : "Add time"}
                        </button>

                        {showTime ? (
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                    <TimePicker value={startTimeValue} onChange={handleStartTimeChange} label="Start time" />
                                    <span className="shrink-0 text-xs text-twilight-text-muted">→</span>
                                    {endTimeValue ? (
                                        <TimePicker value={endTimeValue} onChange={handleEndTimeChange} label="End time" />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleAddEnd}
                                            className="inline-flex min-h-9 cursor-pointer items-center rounded-xl border border-dashed border-twilight-border px-2.5 text-xs text-twilight-text-muted transition-colors hover:bg-white/[0.04] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                                        >
                                            Add end
                                        </button>
                                    )}
                                </div>
                                {endTimeValue ? (
                                    <Tip label="Remove end time" side="top">
                                        <button
                                            type="button"
                                            onClick={handleRemoveEnd}
                                            aria-label="Remove end time"
                                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-twilight-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                                        >
                                            <X size={13} aria-hidden="true" />
                                        </button>
                                    </Tip>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <RecurrencePicker
                    value={recurrenceRule}
                    onChange={(value) => onChange({
                        dueDate: selectedDate,
                        scheduledStart: mode === "duration" ? null : scheduledStart,
                        scheduledEnd: mode === "duration" ? rangeEndDate : (scheduledEnd ?? null),
                        recurrenceRule: value,
                        isAllDay: mode === "duration" || !showTime,
                    })}
                />

                <button
                    type="button"
                    onClick={clearDeadline}
                    aria-label="Clear deadline"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-twilight-border py-1.5 text-xs font-medium text-twilight-text-muted transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
                >
                    <X size={13} aria-hidden="true" />
                    Clear
                </button>
            </div>
        </div>
    );
}
