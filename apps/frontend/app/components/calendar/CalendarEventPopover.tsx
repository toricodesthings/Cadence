import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, CalendarHeart, CalendarRange, ChevronLeft, ChevronRight, Clock3, Repeat } from "lucide-react";
import { useCreateTask } from "../../hooks/tasks";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import { parseLocalDate, toISODate, getDateFormatConfig } from "../../lib/utils/date-format";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { cn } from "../../lib/utils";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import * as Popover from "../primitives/Popover";
import { TimePicker } from "../primitives";
import { Switch } from "../primitives";
import { Button } from "../primitives/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../primitives/Dialog";
import type { EffortLevel, TaskInteractionMode, TaskPriority } from "../../types/task";

export interface CalendarEventInfo {
    date: string;
    startHour: number;
    startMinute: number;
    isAllDay?: boolean;
    anchorX: number;
    anchorY: number;
}

interface CalendarEventPopoverProps {
    info: CalendarEventInfo;
    initialTab?: "task" | "event";
    onClose: () => void;
}

type ComposerMode = "once" | "weekly";
type ScheduleCreateTab = "task" | "event";
type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

const WEEKDAY_ORDER: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_LABELS: Record<WeekdayCode, { letter: string; long: string }> = {
    MO: { letter: "M", long: "Monday" },
    TU: { letter: "T", long: "Tuesday" },
    WE: { letter: "W", long: "Wednesday" },
    TH: { letter: "T", long: "Thursday" },
    FR: { letter: "F", long: "Friday" },
    SA: { letter: "S", long: "Saturday" },
    SU: { letter: "S", long: "Sunday" },
};

function toWeekdayCode(date: string): WeekdayCode {
    const day = new Date(`${date}T00:00:00`).getDay();
    return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day] ?? "MO") as WeekdayCode;
}

function formatDateLabel(date: string) {
    const config = getDateFormatConfig();
    const d = parseLocalDate(date);
    if (config.dateStyle === "dmy") {
        return d.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
        });
    }
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function formatTimeValue(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addHour(timeValue: string) {
    const [hours, minutes] = timeValue.split(":").map(Number);
    const end = new Date();
    end.setHours(hours + 1, minutes, 0, 0);
    return formatTimeValue(end.getHours(), end.getMinutes());
}

function buildUntilValue(date: string) {
    const end = new Date(`${date}T23:59:59`);
    return end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildWeeklyRule(days: WeekdayCode[], endDate: string | null) {
    const orderedDays = WEEKDAY_ORDER.filter((day) => days.includes(day));
    const base = `FREQ=WEEKLY;BYDAY=${orderedDays.join(",")}`;
    return endDate ? `${base};UNTIL=${buildUntilValue(endDate)}` : base;
}

function WeekdayPicker({
    value,
    onChange,
}: {
    value: WeekdayCode[];
    onChange: (days: WeekdayCode[]) => void;
}) {
    return (
        <div
            role="group"
            aria-label="Select days of the week"
            className="flex justify-center gap-2"
        >
            {WEEKDAY_ORDER.map((day) => {
                const active = value.includes(day);
                return (
                    <button
                        key={day}
                        type="button"
                        title={WEEKDAY_LABELS[day].long}
                        aria-label={WEEKDAY_LABELS[day].long}
                        aria-pressed={active}
                        onClick={() => {
                            if (active && value.length === 1) return;
                            onChange(active ? value.filter((item) => item !== day) : [...value, day]);
                        }}
                        className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lantern/50 ${
                            active
                                ? "border border-lantern/30 bg-lantern/15 text-lantern shadow-[0_0_12px_rgba(232,164,74,0.08)]"
                                : "border border-white/[0.07] bg-white/[0.04] text-twilight-text-muted hover:bg-white/[0.07] hover:text-twilight-text"
                        }`}
                    >
                        {WEEKDAY_LABELS[day].letter}
                    </button>
                );
            })}
        </div>
    );
}

const EMPTY_DAY_SET = new Set<number>();

function EventDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const selectedDate = useMemo(() => parseLocalDate(value), [value]);
    const [viewDate, setViewDate] = useState(selectedDate);

    useEffect(() => {
        setViewDate(selectedDate);
    }, [selectedDate]);

    const handleMonthChange = (delta: number) => {
        setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    };

    const handleSelectDate = (day: number) => {
        const next = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onChange(toISODate(next));
    };

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-white/[0.10] hover:bg-white/[0.05]"
                    aria-label="Choose event date"
                >
                    <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-moonlit">
                            <Calendar size={16} aria-hidden="true" />
                        </span>
                        <span className="text-sm font-medium text-twilight-text">{formatDateLabel(value)}</span>
                    </span>
                </button>
            </Popover.Trigger>
            <Popover.Content side="bottom" align="start" className="w-[20rem] rounded-[24px] p-0 overflow-hidden">
                <div className="border-b border-twilight-border/40 px-3 py-2.5">
                    <div className="flex items-center justify-between">
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
                </div>

                <div className="px-3 pb-3 pt-2">
                    <CalendarGrid
                        year={viewDate.getFullYear()}
                        month={viewDate.getMonth()}
                        selectedDate={value}
                        datesWithTasks={EMPTY_DAY_SET}
                        onSelectDate={handleSelectDate}
                        variant="compact"
                    />
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}

export function CalendarEventPopover({ info, initialTab = "task", onClose }: CalendarEventPopoverProps) {
    const shell = useShellMode();
    const taskTitleRef = useRef<HTMLInputElement>(null);
    const eventTitleRef = useRef<HTMLInputElement>(null);
    const { mutate: createTask, isPending } = useCreateTask();
    const personalEvents = usePersonalEvents(new Date(`${info.date}T00:00:00`).getFullYear());

    const [tab, setTab] = useState<ScheduleCreateTab>(initialTab);

    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [mode, setMode] = useState<ComposerMode>("once");
    const [startDate, setStartDate] = useState(info.date);
    const [endDate, setEndDate] = useState<string>("");
    const [hasEndDate, setHasEndDate] = useState(false);
    const [weekdays, setWeekdays] = useState<WeekdayCode[]>([toWeekdayCode(info.date)]);
    const [startTime, setStartTime] = useState(formatTimeValue(info.startHour, info.startMinute));
    const [endTime, setEndTime] = useState(addHour(formatTimeValue(info.startHour, info.startMinute)));
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [effort, setEffort] = useState<EffortLevel>(null);
    const [interactionMode, setInteractionMode] = useState<TaskInteractionMode>("timetable");

    const [eventLabel, setEventLabel] = useState("");
    const [eventDate, setEventDate] = useState(info.date);
    const [eventEmoji, setEventEmoji] = useState("");
    const [eventNotify, setEventNotify] = useState(true);

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const id = requestAnimationFrame(() => {
            if (tab === "task") {
                taskTitleRef.current?.focus();
            } else {
                eventTitleRef.current?.focus();
            }
        });
        return () => cancelAnimationFrame(id);
    }, [tab]);

    const taskDirty = Boolean(title.trim() || notes.trim() || mode === "weekly" || hasEndDate || priority > 0 || effort !== null);
    const eventDirty = Boolean(eventLabel.trim() || eventEmoji.trim() || eventDate !== info.date || !eventNotify);
    const isDirty = taskDirty || eventDirty;

    const requestClose = useCallback(() => {
        if (!isDirty || window.confirm("Discard this schedule draft?")) {
            onClose();
        }
    }, [isDirty, onClose]);

    const recurrenceRule = mode === "weekly" ? buildWeeklyRule(weekdays, hasEndDate ? endDate : null) : null;
    const summary = useMemo(
        () =>
            mode === "weekly"
                ? getTaskRecurrenceSummary({
                    recurrenceRule,
                    scheduledStart: new Date(`${startDate}T${startTime}:00`).toISOString(),
                    scheduledEnd: new Date(`${startDate}T${endTime}:00`).toISOString(),
                })
                : null,
        [mode, recurrenceRule, startDate, startTime, endTime],
    );

    const handleTaskSubmit = useCallback(() => {
        if (!title.trim()) return;

        const start = new Date(`${startDate}T${startTime}:00`);
        const end = new Date(`${startDate}T${endTime}:00`);
        if (end <= start) {
            end.setDate(end.getDate() + 1);
        }

        createTask(
            {
                title: title.trim(),
                content: notes.trim() || null,
                orderIndex: Date.now(),
                dueDate: startDate,
                scheduledStart: start.toISOString(),
                scheduledEnd: end.toISOString(),
                isAllDay: false,
                timezoneLocked: mode === "weekly",
                recurrenceRule: recurrenceRule ?? undefined,
                interactionMode: recurrenceRule ? interactionMode : "task",
                priority,
                effort,
            },
            { onSuccess: onClose },
        );
    }, [createTask, effort, endTime, interactionMode, mode, notes, onClose, priority, recurrenceRule, startDate, startTime, title]);

    const handleEventSubmit = useCallback(() => {
        if (!eventLabel.trim() || !eventDate) return;

        personalEvents.addEvent({
            label: eventLabel.trim(),
            monthDay: eventDate.slice(5),
            emoji: eventEmoji.trim() || null,
            notify: eventNotify,
        });
        onClose();
    }, [eventDate, eventEmoji, eventLabel, eventNotify, onClose, personalEvents]);

    const eventDateLabel = useMemo(() => formatDateLabel(eventDate), [eventDate]);
    const taskSubtitle = summary?.label ?? (mode === "weekly" ? "Weekly recurring schedule block" : `Planned for ${formatDateLabel(startDate)}`);

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) requestClose(); }}>
            <DialogContent
                className={cn(
                    "flex flex-col gap-0 w-[min(calc(100vw-1.5rem),48rem)] overflow-hidden rounded-[30px] border border-white/[0.10] bg-[linear-gradient(180deg,rgba(18,30,52,0.96),rgba(10,18,34,0.98))] p-0 shadow-[0_32px_120px_rgba(0,0,0,0.52)]",
                    shell.isPhone
                        ? "inset-x-3 bottom-3 max-h-[88dvh]"
                        : "sm:max-w-3xl sm:max-h-[84dvh]",
                )}
            >
                    <DialogHeader className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
                        <div className="space-y-1">
                            <DialogTitle className="font-display text-xl tracking-tight text-twilight-text">
                                Create on {tab === "task" ? formatDateLabel(startDate) : eventDateLabel}
                            </DialogTitle>
                            <DialogDescription className="text-sm text-twilight-text-soft">
                                {tab === "task"
                                    ? taskSubtitle
                                    : "Yearly personal event"}
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="shrink-0 border-b border-white/[0.06] px-5 py-3 sm:px-6">
                        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1" role="tablist" aria-label="Create type">
                            {([
                                { id: "task", label: "Task", icon: CalendarRange },
                                { id: "event", label: "Event", icon: CalendarHeart },
                            ] as const).map((option) => {
                                const Icon = option.icon;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === option.id}
                                        onClick={() => setTab(option.id)}
                                        className={cn(
                                            "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
                                            tab === option.id
                                                ? option.id === "task"
                                                    ? "bg-lantern/15 text-lantern"
                                                    : "bg-personal/15 text-personal"
                                                : "text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text",
                                        )}
                                    >
                                        <Icon size={15} aria-hidden="true" />
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="min-h-0 flex-auto overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                        {tab === "task" ? (
                            <div className="space-y-4">
                                <input
                                    ref={taskTitleRef}
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    placeholder="Block title…"
                                    className="w-full border-b border-white/[0.06] bg-transparent pb-3 font-display text-xl text-twilight-text outline-none placeholder:text-twilight-text-muted/60"
                                />

                                <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1">
                                    {([
                                        { id: "once", label: "Once" },
                                        { id: "weekly", label: "Repeats weekly" },
                                    ] as const).map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setMode(option.id)}
                                            className={`min-h-10 cursor-pointer rounded-xl px-3 text-sm font-medium transition-colors ${
                                                mode === option.id
                                                    ? "bg-lantern/15 text-lantern"
                                                    : "text-twilight-text-soft hover:bg-white/[0.05]"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>

                                {mode === "weekly" ? (
                                    <>
                                        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
                                        <div className="rounded-2xl border border-moonlit/18 bg-moonlit/[0.05] px-4 py-3">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium text-twilight-text">Treat this as a timetable anchor</p>
                                                    <p className="text-xs leading-relaxed text-twilight-text-soft">
                                                        Anchors stay in the schedule without asking for a check-off. Turn this off if the series should behave like a task.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={interactionMode === "timetable"}
                                                    onCheckedChange={(checked) => setInteractionMode(checked ? "timetable" : "task")}
                                                    aria-label="Treat this recurring block as a timetable anchor"
                                                />
                                            </div>
                                            <p className="mt-3 text-xs font-medium text-moonlit">
                                                {interactionMode === "timetable" ? "Default for recurring schedule anchors" : "Needs check-off"}
                                            </p>
                                        </div>
                                    </>
                                ) : null}

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="space-y-1.5">
                                        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Start</span>
                                        <TimePicker
                                            value={startTime}
                                            onChange={setStartTime}
                                            icon={<Clock3 size={14} className="text-moonlit" />}
                                        />
                                    </label>

                                    <label className="space-y-1.5">
                                        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">End</span>
                                        <TimePicker
                                            value={endTime}
                                            onChange={setEndTime}
                                            icon={<Clock3 size={14} className="text-moonlit" />}
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="space-y-1.5">
                                        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">From</span>
                                        <div className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(event) => {
                                                    setStartDate(event.target.value);
                                                    if (mode === "weekly") {
                                                        setWeekdays([toWeekdayCode(event.target.value)]);
                                                    }
                                                }}
                                                className="w-full cursor-pointer bg-transparent text-sm text-twilight-text outline-none [color-scheme:dark]"
                                            />
                                        </div>
                                    </label>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Until</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setHasEndDate((value) => !value);
                                                    if (hasEndDate) {
                                                        setEndDate("");
                                                    } else {
                                                        setEndDate(startDate);
                                                    }
                                                }}
                                                className={`cursor-pointer text-[11px] font-medium transition-colors ${hasEndDate ? "text-lantern" : "text-twilight-text-muted hover:text-twilight-text-soft"}`}
                                            >
                                                {hasEndDate ? "Remove" : "Add end date"}
                                            </button>
                                        </div>
                                        <div className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(event) => setEndDate(event.target.value)}
                                                disabled={!hasEndDate}
                                                className="w-full cursor-pointer bg-transparent text-sm text-twilight-text outline-none disabled:cursor-not-allowed disabled:opacity-30 [color-scheme:dark]"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <details className="group rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                                    <summary className="cursor-pointer list-none text-sm text-twilight-text-soft transition-colors group-open:text-twilight-text">
                                        More options
                                    </summary>
                                    <div className="mt-3 space-y-3 border-t border-white/[0.04] pt-3">
                                        <label className="block">
                                            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Notes</span>
                                            <textarea
                                                value={notes}
                                                onChange={(event) => setNotes(event.target.value)}
                                                rows={2}
                                                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted/60"
                                                placeholder="Room, context, why this block matters…"
                                            />
                                        </label>

                                        <div>
                                            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Priority</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {([
                                                    { value: 0, label: "None" },
                                                    { value: 1, label: "P1" },
                                                    { value: 2, label: "P2" },
                                                    { value: 3, label: "P3" },
                                                    { value: 4, label: "P4" },
                                                ] as const).map((item) => (
                                                    <button
                                                        key={item.value}
                                                        type="button"
                                                        onClick={() => setPriority(item.value as TaskPriority)}
                                                        className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                            priority === item.value
                                                                ? "border-lantern/30 bg-lantern/15 text-lantern"
                                                                : "border-white/[0.06] text-twilight-text-soft hover:bg-white/[0.05]"
                                                        }`}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Effort</span>
                                            <div className="flex gap-1.5">
                                                {([
                                                    { value: 1, label: "Low" },
                                                    { value: 2, label: "Medium" },
                                                    { value: 3, label: "High" },
                                                ] as const).map((item) => (
                                                    <button
                                                        key={item.value}
                                                        type="button"
                                                        onClick={() => setEffort(effort === item.value ? null : item.value)}
                                                        className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                            effort === item.value
                                                                ? "border-lantern/30 bg-lantern/15 text-lantern"
                                                                : "border-white/[0.06] text-twilight-text-soft hover:bg-white/[0.05]"
                                                        }`}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Event</span>
                                    <div className="flex items-center gap-3 rounded-[28px] border border-white/[0.06] bg-white/[0.03] p-3">
                                        <EmojiPickerPopover emoji={eventEmoji} onSelect={setEventEmoji}>
                                            <button
                                                type="button"
                                                aria-label="Pick an emoji"
                                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] text-[24px] text-twilight-text transition-colors hover:border-white/[0.10] hover:bg-white/[0.06]"
                                            >
                                                {eventEmoji || <CalendarHeart size={18} className="text-personal" />}
                                            </button>
                                        </EmojiPickerPopover>

                                        <input
                                            ref={eventTitleRef}
                                            type="text"
                                            value={eventLabel}
                                            onChange={(event) => setEventLabel(event.target.value)}
                                            placeholder="Mom's birthday, retreat, launch day…"
                                            maxLength={80}
                                            className="min-w-0 flex-1 bg-transparent text-[1.05rem] font-medium text-twilight-text outline-none placeholder:text-twilight-text-muted/55"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Date</span>
                                    <EventDatePicker value={eventDate} onChange={setEventDate} />
                                </div>

                                <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] px-4 py-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-twilight-text">Notifications</p>
                                            <p className="text-xs text-twilight-text-soft">Show a reminder dot</p>
                                        </div>
                                        <Switch
                                            checked={eventNotify}
                                            onCheckedChange={setEventNotify}
                                            aria-label="Enable notifications for this personal event"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="shrink-0 border-t border-white/[0.06] px-5 py-4 sm:px-6 sm:py-5">
                        {tab === "task" && mode === "weekly" && summary?.label ? (
                            <p className="mr-auto flex items-center gap-2 text-xs text-twilight-text-muted">
                                <Repeat size={12} className="shrink-0 text-lantern" />
                                <span>{summary.label}</span>
                            </p>
                        ) : (
                            <div className="mr-auto" />
                        )}

                        <Button variant="ghost" size="md" onClick={requestClose}>
                            Cancel
                        </Button>

                        {tab === "task" ? (
                            <Button
                                variant="primary"
                                size="md"
                                onClick={handleTaskSubmit}
                                disabled={!title.trim() || isPending}
                                className="bg-lantern/18 text-lantern hover:bg-lantern/26 disabled:opacity-40"
                            >
                                <CalendarRange size={14} aria-hidden="true" />
                                {isPending ? "Saving…" : mode === "weekly" ? "Create series" : "Add to schedule"}
                            </Button>
                        ) : (
                            <Button
                                variant="primary"
                                size="md"
                                onClick={handleEventSubmit}
                                disabled={!eventLabel.trim()}
                                className="bg-personal/18 text-personal hover:bg-personal/26 disabled:opacity-40"
                            >
                                <CalendarHeart size={14} aria-hidden="true" />
                                Add event
                            </Button>
                        )}
                    </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
