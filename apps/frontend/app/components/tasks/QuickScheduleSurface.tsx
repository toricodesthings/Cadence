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
import { addDays, weekdayOf, type Instant, type LocalDate, type WallTime } from "@cadence/domain/time";
import { blockEnd, dayOfInstant, fromTimeValue, toTimeValue } from "../../lib/utils/date-format";
import { daysIn } from "../../lib/utils/calendar/calendar-math";
import { today } from "../../lib/utils/user-zone";

/**
 * What the picker writes. All-day: `dueDate` (a deadline is a day, never a time), plus `endDate`
 * (inclusive) for a multi-day span. Timed block: `scheduledStart`/`scheduledEnd` instants only.
 */
export interface ScheduleUpdates {
    dueDate: LocalDate | null;
    endDate: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    recurrenceRule: string | null;
}

interface QuickScheduleSurfaceProps {
    dueDate: LocalDate | null;
    endDate?: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd?: Instant | null;
    recurrenceRule: string | null;
    isOpen?: boolean;
    onChange: (updates: ScheduleUpdates) => void;
    onRequestClose?: () => void;
}

type PickerMode = "deadline" | "duration";

/** The Monday after `day` (the day itself when it is a Sunday's next day, never `day`). */
function getNextMonday(day: LocalDate): LocalDate {
    const weekday = weekdayOf(day);
    return addDays(day, weekday === 0 ? 1 : 8 - weekday);
}

const QUICK_ACTIONS = [
    { id: "today", icon: Sun, label: "Today" },
    { id: "tomorrow", icon: Sunset, label: "Tomorrow" },
    { id: "next_week", icon: CalendarClock, label: "Next Monday" },
] as const;

const DEFAULT_TIME: WallTime = "09:00";

/** "HH:mm" + 1 hour (wraps past midnight). */
function plusOneHour(time: string): string {
    const [h, m] = time.split(":").map(Number);
    return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const initialDay = (dueDate: LocalDate | null, scheduledStart: Instant | null): LocalDate =>
    scheduledStart ? dayOfInstant(scheduledStart) : (dueDate ?? today());

export function QuickScheduleSurface({
    dueDate,
    endDate = null,
    scheduledStart,
    scheduledEnd,
    recurrenceRule,
    isOpen = true,
    onChange,
    onRequestClose,
}: QuickScheduleSurfaceProps) {
    const [viewDay, setViewDay] = useState<LocalDate>(initialDay(dueDate, scheduledStart));
    const [selectedDate, setSelectedDate] = useState<LocalDate>(initialDay(dueDate, scheduledStart));
    const [rangeEndDate, setRangeEndDate] = useState<LocalDate | null>(endDate);
    const [showTime, setShowTime] = useState(Boolean(scheduledStart));
    const [endTimeValue, setEndTimeValue] = useState<WallTime | null>(
        scheduledStart && scheduledEnd ? toTimeValue(scheduledEnd) : null,
    );
    const [mode, setMode] = useState<PickerMode>(endDate ? "duration" : "deadline");
    const [rangeClickStep, setRangeClickStep] = useState<"start" | "end">("start");

    useEffect(() => {
        if (!isOpen) return;

        const day = initialDay(dueDate, scheduledStart);
        setViewDay(day);
        setSelectedDate(day);
        setRangeEndDate(endDate);
        setShowTime(Boolean(scheduledStart));
        setEndTimeValue(scheduledStart && scheduledEnd ? toTimeValue(scheduledEnd) : null);
        setMode(endDate ? "duration" : "deadline");
        setRangeClickStep("start");
    }, [dueDate, endDate, isOpen, scheduledEnd, scheduledStart]);

    const startTimeValue = scheduledStart ? toTimeValue(scheduledStart) : DEFAULT_TIME;

    /** A deadline day, or a timed block on `day`. */
    const dayUpdates = (day: LocalDate, timed: boolean, start: WallTime, end: WallTime | null, rule = recurrenceRule): ScheduleUpdates => {
        if (!timed) return { dueDate: day, endDate: null, scheduledStart: null, scheduledEnd: null, recurrenceRule: rule };
        const startIso = fromTimeValue(day, start);
        return { dueDate: null, endDate: null, scheduledStart: startIso, scheduledEnd: end ? blockEnd(day, startIso, end) : null, recurrenceRule: rule };
    };
    const spanUpdates = (start: LocalDate, end: LocalDate | null, rule = recurrenceRule): ScheduleUpdates =>
        ({ dueDate: start, endDate: end, scheduledStart: null, scheduledEnd: null, recurrenceRule: rule });

    const handleSelectDate = (day: LocalDate) => {
        if (mode === "duration") {
            // Duration is always an all-day span: times live on Deadline.
            if (rangeClickStep === "start") {
                setSelectedDate(day);
                setRangeEndDate(null);
                setRangeClickStep("end");
                onChange(spanUpdates(day, null));
                return;
            }

            const [first, last] = day < selectedDate ? [day, selectedDate] : [selectedDate, day];
            setSelectedDate(first);
            setRangeEndDate(last);
            onChange(spanUpdates(first, last));
            setRangeClickStep("start");
            return;
        }

        setSelectedDate(day);
        onChange(dayUpdates(day, showTime, startTimeValue, endTimeValue));
    };

    const handleQuickAction = (preset: "today" | "tomorrow" | "next_week") => {
        const now = today();
        const day = preset === "tomorrow" ? addDays(now, 1) : preset === "next_week" ? getNextMonday(now) : now;
        setSelectedDate(day);
        setViewDay(day);
        setRangeEndDate(null);
        setRangeClickStep("start");
        onChange(dayUpdates(day, showTime && mode === "deadline", startTimeValue, endTimeValue));
    };

    const getActivePreset = (): string => {
        const now = today();
        if (selectedDate === now) return "today";
        if (selectedDate === addDays(now, 1)) return "tomorrow";
        if (selectedDate === getNextMonday(now)) return "next_week";
        return "";
    };

    // The TimePicker commits on Enter/blur/pick: no debounce needed.
    const handleStartTimeChange = (time: WallTime) => {
        const startIso = fromTimeValue(selectedDate, time);
        let endIso: Instant | null = null;
        if (endTimeValue) {
            const sameDayEnd = fromTimeValue(selectedDate, endTimeValue);
            // Keep a positive block: when the end would land at or before the
            // new start, bump it to start + 1 hour.
            endIso = Date.parse(sameDayEnd) > Date.parse(startIso)
                ? sameDayEnd
                : new Date(Date.parse(startIso) + 60 * 60000).toISOString();
            setEndTimeValue(toTimeValue(endIso));
        }
        onChange({ dueDate: null, endDate: null, scheduledStart: startIso, scheduledEnd: endIso, recurrenceRule });
    };

    const handleEndTimeChange = (picked: WallTime) => {
        // End = start would roll over into a 24h block; push it an hour out instead.
        const time = picked === startTimeValue ? plusOneHour(picked) : picked;
        setEndTimeValue(time);
        onChange(dayUpdates(selectedDate, true, startTimeValue, time));
    };

    const handleAddEnd = () => {
        const end = plusOneHour(startTimeValue);
        setEndTimeValue(end);
        onChange(dayUpdates(selectedDate, true, startTimeValue, end));
    };

    const handleRemoveEnd = () => {
        setEndTimeValue(null);
        onChange(dayUpdates(selectedDate, true, startTimeValue, null));
    };

    const clearDeadline = () => {
        const now = today();
        onChange({ dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, recurrenceRule: null });
        setSelectedDate(now);
        setViewDay(now);
        setRangeEndDate(null);
        setShowTime(false);
        setEndTimeValue(null);
        setRangeClickStep("start");
        onRequestClose?.();
    };

    const activePreset = getActivePreset();
    const datesWithRange = new Set<number>();
    if (mode === "duration" && selectedDate && rangeEndDate) {
        const viewMonth = viewDay.slice(0, 7);
        for (const day of daysIn(selectedDate, rangeEndDate)) if (day.startsWith(viewMonth)) datesWithRange.add(Number(day.slice(8, 10)));
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
                            onChange(spanUpdates(selectedDate, rangeEndDate));
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
                viewDay={viewDay}
                onViewDayChange={setViewDay}
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
                                    onChange(dayUpdates(selectedDate, false, startTimeValue, null));
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
                    onChange={(value) => onChange(
                        mode === "duration"
                            ? spanUpdates(selectedDate, rangeEndDate, value)
                            : dayUpdates(selectedDate, showTime, startTimeValue, endTimeValue, value),
                    )}
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
