import { useEffect, useRef, useState } from "react";
import {
    Sun,
    Sunset,
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    X,
    Clock,
    Calendar as CalendarIcon,
    CalendarRange,
} from "lucide-react";
import { Tip } from "../primitives";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { TimePickerInput } from "./TimePickerInput";
import { RecurrencePicker } from "./RecurrencePicker";
import { addDays, parseLocalDate, toISODate } from "../../lib/utils/date-format";

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
    const [mode, setMode] = useState<PickerMode>("deadline");
    const [rangeClickStep, setRangeClickStep] = useState<"start" | "end">("start");

    // Debounce refs — always access the latest flush logic via a ref
    // so setTimeout never runs a stale closure.
    const timeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingTimeRef = useRef<string | null>(null);
    const isDebouncingRef = useRef(false);
    const flushTimeChangeRef = useRef<() => void>(() => {});

    // Keep the ref up-to-date on every render so it captures the latest state
    flushTimeChangeRef.current = () => {
        if (pendingTimeRef.current) {
            const iso = pendingTimeRef.current;
            pendingTimeRef.current = null;
            isDebouncingRef.current = false;
            onChange({
                dueDate: selectedDate,
                scheduledStart: iso,
                scheduledEnd: rangeEndDate,
                recurrenceRule,
                isAllDay: false,
            });
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        // Skip prop sync while the user is actively changing the time — the
        // optimistic update from a previous mutation should not reset state.
        if (isDebouncingRef.current) return;

        const nextInitialDate = scheduledStart ? parseLocalDate(scheduledStart) : (dueDate ? parseLocalDate(dueDate) : new Date());
        setViewDate(nextInitialDate);
        setSelectedDate(dueDate ?? toISODate(nextInitialDate));
        setRangeEndDate(scheduledEnd ?? null);
        setShowTime(Boolean(scheduledStart));
        setRangeClickStep("start");
    }, [dueDate, isOpen, scheduledEnd, scheduledStart]);

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
                return;
            }

            const startD = new Date(selectedDate);
            const endD = new Date(iso);

            if (endD < startD) {
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
            return;
        }

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
        const tomorrowIso = toISODate(addDays(new Date(), 1));
        const nextMondayIso = toISODate(getNextMonday());
        if (selectedDate === todayIso) return "today";
        if (selectedDate === tomorrowIso) return "tomorrow";
        if (selectedDate === nextMondayIso) return "next_week";
        return "";
    };

    // Cleanup on unmount — clear pending timeout
    useEffect(() => () => {
        if (timeDebounceRef.current) clearTimeout(timeDebounceRef.current);
    }, []);

    const handleTimeChange = (timeIso: string) => {
        const t = new Date(timeIso);
        const d = new Date(selectedDate);
        d.setHours(t.getHours(), t.getMinutes(), 0, 0);
        pendingTimeRef.current = d.toISOString();
        isDebouncingRef.current = true;

        if (timeDebounceRef.current) clearTimeout(timeDebounceRef.current);
        timeDebounceRef.current = setTimeout(() => flushTimeChangeRef.current(), 400);
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
            <div className="flex items-center gap-1 border-b border-twilight-border/40 px-3 py-2" role="tablist" aria-label="Picker mode">
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

            <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[12px] font-semibold text-twilight-text">
                    {viewDate.toLocaleString("default", { month: "long", year: "numeric" })}
                </span>
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={() => handleMonthChange(-1)}
                        aria-label="Previous month"
                        className="rounded-lg p-1.5 text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                    >
                        <ChevronLeft size={15} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleMonthChange(1)}
                        aria-label="Next month"
                        className="rounded-lg p-1.5 text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                    >
                        <ChevronRight size={15} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="px-3 pb-2">
                <CalendarGrid
                    year={viewDate.getFullYear()}
                    month={viewDate.getMonth()}
                    selectedDate={selectedDate}
                    datesWithTasks={datesWithRange}
                    onSelectDate={handleSelectDate}
                    variant="compact"
                />
                {mode === "duration" ? (
                    <p className="mt-1.5 text-center text-[10px] text-twilight-text-muted/90">
                        {rangeClickStep === "start" ? "Pick a start date" : "Pick an end date"}
                    </p>
                ) : null}
            </div>

            <div className="space-y-2 border-t border-twilight-border/40 px-3 pb-3 pt-2">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
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
                        className={`inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider ${
                            showTime ? "text-accent-primary" : "text-twilight-text-muted/90 hover:text-twilight-text-muted"
                        }`}
                    >
                        <Clock size={11} aria-hidden="true" />
                        {showTime ? "Time set" : "Add time"}
                    </button>
                    {showTime ? <TimePickerInput value={scheduledStart} onChange={handleTimeChange} /> : null}
                </div>

                <RecurrencePicker
                    value={recurrenceRule}
                    onChange={(value) => onChange({
                        dueDate: selectedDate,
                        scheduledStart,
                        scheduledEnd: rangeEndDate,
                        recurrenceRule: value,
                        isAllDay: !showTime,
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
