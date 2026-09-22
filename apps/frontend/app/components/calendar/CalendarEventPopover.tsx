import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CalendarHeart, CalendarRange, Clock3, Flag, Gauge, Milestone, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, EFFORT_OPTIONS, FIELD_LABEL, PRIORITY_OPTIONS } from "../tasks/task-choice-options";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import { formatShortDateLabel, parseLocalDate, toISODate } from "../../lib/utils/date-format";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
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
    /** Length of the draft block; an hour when unset. */
    durationMinutes?: number;
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

function addMinutes(timeValue: string, delta: number) {
    const [hours, minutes] = timeValue.split(":").map(Number);
    const end = new Date();
    end.setHours(hours, minutes + delta, 0, 0);
    return formatTimeValue(end.getHours(), end.getMinutes());
}

function minutesBetween(start: string, end: string) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? diff : diff + 24 * 60;
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
    // Phones lead with one line to type; the exact times wait under More.
    const isPhone = useShellMode().isPhone;

    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [mode, setMode] = useState<ComposerMode>("once");
    const [startDate, setStartDate] = useState(info.date);
    const [endDate, setEndDate] = useState<string>("");
    const [hasEndDate, setHasEndDate] = useState(false);
    const [weekdays, setWeekdays] = useState<WeekdayCode[]>([toWeekdayCode(info.date)]);
    const [startTime, setStartTime] = useState(formatTimeValue(info.startHour, info.startMinute));
    const [endTime, setEndTime] = useState(addMinutes(formatTimeValue(info.startHour, info.startMinute), info.durationMinutes ?? 60));
    /** Once a time or date field is touched, typed dates stop steering them. */
    const [whenTouched, setWhenTouched] = useState(false);
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

    // "Dinner with Sam Fri 7pm": a typed day and time fill the when, until a field is touched.
    const { data: userSettings } = useSettings();
    const intelligence = userSettings?.tasks?.intelligence;
    const nlp = useNlpParse({
        input: title,
        projects: [],
        tags: [],
        enabled: isPhone && tab === "task" && mode === "once" && !whenTouched && intelligence?.nlpEnabled !== false,
        sourceSurface: "quick_add",
        dateStyle: userSettings?.dateTime?.dateStyle ?? "mdy",
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
        lowStimulationMode: intelligence?.lowStimulationMode ?? false,
    });
    const parsedStart = !whenTouched && mode === "once" && nlp.scheduledStart ? new Date(nlp.scheduledStart) : null;
    const parsedDate = !whenTouched && mode === "once" && nlp.dueDate ? toISODate(parseLocalDate(nlp.dueDate.slice(0, 10))) : null;
    const whenStartDate = parsedStart ? toISODate(parsedStart) : parsedDate ?? startDate;
    const whenStartTime = parsedStart ? formatTimeValue(parsedStart.getHours(), parsedStart.getMinutes()) : startTime;
    const whenEndTime = parsedStart ? addMinutes(whenStartTime, nlp.durationMinutes ?? minutesBetween(startTime, endTime)) : endTime;
    const parsedWhen = Boolean(parsedStart || parsedDate);
    const submitTitle = (parsedWhen && nlp.cleanedTitle.trim()) || title.trim();

    /** Hand the typed when to the fields before the user edits one of them. */
    const touchWhen = () => {
        if (whenTouched) return;
        setStartDate(whenStartDate);
        setStartTime(whenStartTime);
        setEndTime(whenEndTime);
        setWhenTouched(true);
    };

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
                    scheduledStart: new Date(`${whenStartDate}T${whenStartTime}:00`).toISOString(),
                    scheduledEnd: new Date(`${whenStartDate}T${whenEndTime}:00`).toISOString(),
                })
                : null,
        [mode, recurrenceRule, whenStartDate, whenStartTime, whenEndTime],
    );

    const handleTaskSubmit = useCallback(() => {
        if (!submitTitle) return;

        const start = new Date(`${whenStartDate}T${whenStartTime}:00`);
        const end = new Date(`${whenStartDate}T${whenEndTime}:00`);
        if (end <= start) {
            end.setDate(end.getDate() + 1);
        }

        createTask(
            {
                title: submitTitle,
                content: notes.trim() || null,
                orderIndex: Date.now(),
                dueDate: whenStartDate,
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
    }, [createTask, effort, interactionMode, mode, notes, onClose, priority, recurrenceRule, submitTitle, whenEndTime, whenStartDate, whenStartTime]);

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
    const taskSubtitle = mode === "weekly" ? (summary?.label ?? "Repeats every week") : formatTimeRange(whenStartTime, whenEndTime);

    const composerTitle = `Create on ${tab === "task" ? formatShortDateLabel(whenStartDate) : eventDateLabel}`;
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

    const whenFields = (
        <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                    <span className={FIELD_LABEL}>Start</span>
                    <TimePicker value={whenStartTime} onChange={(value) => { touchWhen(); setStartTime(value); }} icon={<Clock3 size={14} className="text-moonlit" />} />
                </label>
                <label className="space-y-1.5">
                    <span className={FIELD_LABEL}>End</span>
                    <TimePicker value={whenEndTime} onChange={(value) => { touchWhen(); setEndTime(value); }} icon={<Clock3 size={14} className="text-moonlit" />} />
                </label>
            </div>

            <div className={`grid gap-3 ${mode === "weekly" ? "grid-cols-2" : "grid-cols-1"}`}>
                <label className="space-y-1.5">
                    <span className={`flex h-6 items-center ${FIELD_LABEL}`}>{mode === "weekly" ? "From" : "Date"}</span>
                    <input
                        type="date"
                        value={whenStartDate}
                        onChange={(event) => {
                            touchWhen();
                            setStartDate(event.target.value);
                            if (mode === "weekly") setWeekdays([toWeekdayCode(event.target.value)]);
                        }}
                        className={`${COMPOSER_FIELD} cursor-pointer`}
                    />
                </label>

                {mode === "weekly" ? <div className="space-y-1.5">
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
                </div> : null}
            </div>
        </>
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
                    disabled={!submitTitle || isPending}
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
                    <ComposerTitle inputRef={taskTitleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isPhone ? "What, and when? e.g. Lunch with Sam Fri 1pm" : "Block title…"} aria-label="Block title" />

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

                    {isPhone ? null : whenFields}

                    <ComposerMore summary={isPhone ? formatTimeRange(whenStartTime, whenEndTime) : null}>
                        {isPhone ? whenFields : null}
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
                        leading={<EmojiMarkButton emoji={eventEmoji || null} onChange={(next) => setEventEmoji(next ?? "")} fallback={<CalendarHeart size={18} className="text-accent-nav-schedule" aria-hidden="true" />} />}
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
