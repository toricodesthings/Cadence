import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CalendarHeart, CalendarRange, Clock3, Flag, Gauge, Milestone, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useCreateTask } from "../../hooks/tasks";
import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, EFFORT_OPTIONS, FIELD_LABEL, PRIORITY_OPTIONS } from "../tasks/task-choice-options";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { TimePicker } from "../primitives";
import {
    Composer,
    ComposerSubmit,
    ComposerMore,
    ComposerTabs,
    ComposerTitle,
    ComposerToggle,
    COMPOSER_FIELD,
    WeekdayPicker,
    WEEKDAY_ORDER,
    type WeekdayCode,
} from "../shared/Composer";
import { EventDatePicker } from "../events/EventDatePicker";
import type { EffortLevel, TaskInteractionMode, TaskPriority } from "@cadence/contracts/task";

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

function toWeekdayCode(date: string): WeekdayCode {
    const day = new Date(`${date}T00:00:00`).getDay();
    return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day] ?? "MO") as WeekdayCode;
}

function formatTimeValue(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatTimeRange(startTime: string, endTime: string) {
    const fmt = (value: string) => {
        const [h, m] = value.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    };
    return `${fmt(startTime)} – ${fmt(endTime)}`;
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

export function CalendarEventPopover({ info, initialTab = "task", onClose }: CalendarEventPopoverProps) {
    const navigate = useNavigate();
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
    const [eventTrackMilestone, setEventTrackMilestone] = useState(false);
    const [eventStartedOn, setEventStartedOn] = useState(info.date);
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
    const eventDirty = Boolean(
        eventLabel.trim()
        || eventEmoji.trim()
        || eventDate !== info.date
        || eventTrackMilestone
        || eventStartedOn !== info.date
        || !eventNotify,
    );
    const isDirty = taskDirty || eventDirty;

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
            startedOn: eventTrackMilestone ? eventStartedOn : null,
        });
        toast.success("Event added", {
            action: {
                label: "View all events",
                onClick: () => navigate("/events"),
            },
        });
        onClose();
    }, [eventDate, eventEmoji, eventLabel, eventNotify, eventStartedOn, eventTrackMilestone, navigate, onClose, personalEvents]);

    const eventDateLabel = useMemo(() => formatShortDateLabel(eventDate), [eventDate]);
    const taskSubtitle = mode === "weekly" ? (summary?.label ?? "Repeats every week") : formatTimeRange(startTime, endTime);

    const composerTitle = `Create on ${tab === "task" ? formatShortDateLabel(startDate) : eventDateLabel}`;
    const composerSubtitle = tab === "task" ? taskSubtitle : "Yearly personal event";

    const typeTabs = (
        <ComposerTabs
            role="tablist"
            ariaLabel="Create type"
            value={tab}
            onChange={setTab}
            options={[
                { id: "task", label: "Task", icon: CalendarRange },
                { id: "event", label: "Event", icon: CalendarHeart, activeClassName: "bg-accent-nav-schedule/15 text-accent-nav-schedule" },
            ]}
        />
    );

    return (
        <Composer
            open
            title={composerTitle}
            subtitle={composerSubtitle}
            band={typeTabs}
            isDirty={isDirty}
            discardTitle="Discard this schedule draft?"
            discardDescription="This will close the composer and lose any unsaved task or event details."
            onClose={onClose}
            footer={tab === "task" ? (
                <ComposerSubmit
                    onSubmit={handleTaskSubmit}
                    submitLabel={isPending ? "Saving…" : mode === "weekly" ? "Create series" : "Add to schedule"}
                    icon={CalendarRange}
                    disabled={!title.trim() || isPending}
                />
            ) : (
                <ComposerSubmit
                    onSubmit={handleEventSubmit}
                    submitLabel="Add event"
                    icon={CalendarHeart}
                    tone="schedule"
                    disabled={!eventLabel.trim()}
                />
            )}
        >
            {tab === "task" ? (
                <>
                    <ComposerTitle inputRef={taskTitleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Block title…" aria-label="Block title" />

                    <ComposerTabs
                        ariaLabel="Repeat"
                        value={mode}
                        onChange={setMode}
                        options={[{ id: "once", label: "Once" }, { id: "weekly", label: "Repeats weekly" }]}
                    />

                    {mode === "weekly" ? (
                        <>
                            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
                            <ComposerToggle
                                label="Fixed"
                                description={interactionMode === "timetable" ? "It just passes if missed. No check-off." : "Still owed if missed. Carries over until checked off."}
                                checked={interactionMode === "timetable"}
                                onCheckedChange={(checked) => setInteractionMode(checked ? "timetable" : "task")}
                                ariaLabel="Make this a fixed block"
                            />
                        </>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                            <span className={FIELD_LABEL}>Start</span>
                            <TimePicker value={startTime} onChange={setStartTime} icon={<Clock3 size={14} className="text-moonlit" />} />
                        </label>
                        <label className="space-y-1.5">
                            <span className={FIELD_LABEL}>End</span>
                            <TimePicker value={endTime} onChange={setEndTime} icon={<Clock3 size={14} className="text-moonlit" />} />
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                            <span className={`flex h-6 items-center ${FIELD_LABEL}`}>From</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => {
                                    setStartDate(event.target.value);
                                    if (mode === "weekly") setWeekdays([toWeekdayCode(event.target.value)]);
                                }}
                                className={`${COMPOSER_FIELD} cursor-pointer`}
                            />
                        </label>

                        <div className="space-y-1.5">
                            <div className="flex h-6 items-center justify-between">
                                <span className={FIELD_LABEL}>Until</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setHasEndDate((value) => !value);
                                        setEndDate(hasEndDate ? "" : startDate);
                                    }}
                                    className={`flex min-h-9 cursor-pointer items-center rounded-lg px-2 text-[11px] font-medium transition-colors sm:-mr-2 ${hasEndDate ? "text-accent-primary" : "text-twilight-text-soft hover:text-twilight-text"}`}
                                >
                                    {hasEndDate ? "Remove" : "Add end date"}
                                </button>
                            </div>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => setEndDate(event.target.value)}
                                disabled={!hasEndDate}
                                aria-label="Until"
                                className={`${COMPOSER_FIELD} cursor-pointer disabled:cursor-not-allowed disabled:opacity-30`}
                            />
                        </div>
                    </div>

                    <ComposerMore>
                        <label className="block">
                            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                                <StickyNote size={12} aria-hidden="true" />
                                Notes
                            </span>
                            <textarea
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                rows={2}
                                className={`${COMPOSER_FIELD} resize-y`}
                                placeholder="Room, context, why this block matters…"
                            />
                        </label>

                        <div role="group" aria-label="Priority">
                            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                                <Flag size={12} aria-hidden="true" />
                                Priority
                            </span>
                            <div className="grid grid-cols-5 gap-1.5">
                                {PRIORITY_OPTIONS.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.value}
                                            type="button"
                                            aria-label={`Priority: ${item.label}`}
                                            aria-pressed={priority === item.value}
                                            onClick={() => setPriority(item.value)}
                                            className={`${CHIP_BASE} min-h-12 flex-col gap-0.5 sm:min-h-10 sm:flex-row sm:gap-1.5 ${priority === item.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                                        >
                                            <Icon size={14} aria-hidden="true" />
                                            <span className="text-[10px] leading-none sm:text-xs sm:leading-normal">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div role="group" aria-label="Effort">
                            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                                <Gauge size={12} aria-hidden="true" />
                                Effort
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                                {EFFORT_OPTIONS.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.value}
                                            type="button"
                                            aria-pressed={effort === item.value}
                                            onClick={() => setEffort(effort === item.value ? null : item.value)}
                                            className={`${CHIP_BASE} ${effort === item.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                                        >
                                            <Icon size={13} aria-hidden="true" />
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </ComposerMore>
                </>
            ) : (
                <>
                    <ComposerTitle
                        inputRef={eventTitleRef}
                        value={eventLabel}
                        onChange={(event) => setEventLabel(event.target.value)}
                        placeholder="Birthday, retreat, launch day…"
                        maxLength={80}
                        aria-label="Event name"
                        leading={(
                            <EmojiPickerPopover emoji={eventEmoji} onSelect={setEventEmoji}>
                                <button
                                    type="button"
                                    aria-label={eventEmoji ? "Change emoji" : "Pick an emoji"}
                                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-[20px] text-twilight-text transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-nav-schedule/50"
                                >
                                    {eventEmoji || <CalendarHeart size={18} className="text-accent-nav-schedule" />}
                                </button>
                            </EmojiPickerPopover>
                        )}
                    />

                    <div className="space-y-2">
                        <span className={FIELD_LABEL}>Date</span>
                        <EventDatePicker value={eventDate} onChange={setEventDate} />
                    </div>

                    <ComposerToggle
                        icon={Milestone}
                        iconClassName="text-accent-nav-schedule"
                        label="Milestone tracking"
                        description="Count the days since it began"
                        checked={eventTrackMilestone}
                        onCheckedChange={(checked) => {
                            setEventTrackMilestone(checked);
                            if (checked) setEventStartedOn((current) => current || eventDate);
                        }}
                        ariaLabel="Enable milestone tracking for this personal event"
                    >
                        {eventTrackMilestone ? (
                            <div className="flex items-center gap-3">
                                <span className={`shrink-0 ${FIELD_LABEL}`}>Started on</span>
                                <div className="min-w-0 flex-1">
                                    <EventDatePicker compact value={eventStartedOn} onChange={setEventStartedOn} />
                                </div>
                            </div>
                        ) : null}
                    </ComposerToggle>

                    <ComposerToggle
                        icon={Bell}
                        iconClassName="text-accent-nav-schedule"
                        label="Notifications"
                        description="Show a reminder dot"
                        checked={eventNotify}
                        onCheckedChange={setEventNotify}
                        ariaLabel="Enable notifications for this personal event"
                    />
                </>
            )}
        </Composer>
    );
}
