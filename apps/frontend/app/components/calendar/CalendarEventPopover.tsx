import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarHeart, CalendarRange, Clock3, StickyNote } from "lucide-react";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { FIELD_LABEL } from "../tasks/task-choice-options";
import { EffortField, PriorityField } from "../tasks/TaskWeightFields";
import { addMinutesToTime, formatShortDateLabel } from "../../lib/utils/date-format";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useTypedWhen } from "../../hooks/use-typed-when";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { TimePicker } from "../primitives";
import { DatePicker } from "../shared/DatePicker";
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
import { usePersonalEventComposer } from "../events/PersonalEventEditorDialog";
import { useAddPersonalEvent } from "./AddPersonalEventDialog";
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
    const taskTitleRef = useRef<HTMLInputElement>(null);
    const { mutate: createTask, isPending } = useCreateTask();
    const addPersonalEvent = useAddPersonalEvent();

    const [tab, setTab] = useState<ScheduleCreateTab>(initialTab);
    // Phones lead with one line to type; the exact times wait under More.
    const isPhone = useShellMode().isPhone;

    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [mode, setMode] = useState<ComposerMode>("once");
    const [endDate, setEndDate] = useState<string>("");
    const [hasEndDate, setHasEndDate] = useState(false);
    const [weekdays, setWeekdays] = useState<WeekdayCode[]>([toWeekdayCode(info.date)]);
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [effort, setEffort] = useState<EffortLevel>(null);
    const [interactionMode, setInteractionMode] = useState<TaskInteractionMode>("timetable");

    const event = usePersonalEventComposer({
        open: true,
        initialDate: info.date,
        autoFocus: false,
        onSubmit: (value) => { addPersonalEvent(value); onClose(); },
    });

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const id = requestAnimationFrame(() => {
            if (tab === "task") {
                taskTitleRef.current?.focus();
            } else {
                event.titleRef.current?.focus();
            }
        });
        return () => cancelAnimationFrame(id);
    }, [tab, event.titleRef]);

    // "Dinner with Sam Fri 7pm": a typed day and time fill the when, until a field is touched.
    const { data: userSettings } = useSettings();
    const intelligence = userSettings?.tasks?.intelligence;
    const startTime = formatTimeValue(info.startHour, info.startMinute);
    const nlpOn = isPhone && tab === "task" && mode === "once" && intelligence?.nlpEnabled !== false;
    const nlp = useNlpParse({
        input: title,
        projects: [],
        tags: [],
        enabled: nlpOn,
        sourceSurface: "quick_add",
        dateStyle: userSettings?.dateTime?.dateStyle ?? "mdy",
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
        lowStimulationMode: intelligence?.lowStimulationMode ?? false,
    });
    const typed = useTypedWhen(nlp, { date: info.date, allDay: false, start: startTime, end: addMinutesToTime(startTime, info.durationMinutes ?? 60) }, nlpOn);
    const { date: whenStartDate, start: whenStartTime, end: whenEndTime } = typed.when;
    const submitTitle = (typed.parsed && nlp.cleanedTitle.trim()) || title.trim();

    const taskDirty = Boolean(title.trim() || notes.trim() || mode === "weekly" || hasEndDate || priority > 0 || effort !== null);
    const isDirty = taskDirty || event.isDirty;

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

    const taskSubtitle = mode === "weekly" ? (summary?.label ?? "Repeats every week") : formatTimeRange(whenStartTime, whenEndTime);

    const composerTitle = tab === "task" ? `Create on ${formatShortDateLabel(whenStartDate)}` : "Add event";
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
                    <TimePicker value={whenStartTime} onChange={(start) => typed.edit({ start })} icon={<Clock3 size={14} className="text-moonlit" />} />
                </label>
                <label className="space-y-1.5">
                    <span className={FIELD_LABEL}>End</span>
                    <TimePicker value={whenEndTime} onChange={(end) => typed.edit({ end })} icon={<Clock3 size={14} className="text-moonlit" />} />
                </label>
            </div>

            <div className={`grid gap-3 ${mode === "weekly" ? "grid-cols-2" : "grid-cols-1"}`}>
                <div className="space-y-1.5">
                    <span className={`flex h-6 items-center ${FIELD_LABEL}`}>{mode === "weekly" ? "From" : "Date"}</span>
                    <DatePicker
                        label={mode === "weekly" ? "From" : "Date"}
                        value={whenStartDate}
                        onChange={(date) => {
                            if (!date) return;
                            typed.edit({ date });
                            if (mode === "weekly") setWeekdays([toWeekdayCode(date)]);
                        }}
                    />
                </div>

                {mode === "weekly" ? <div className="space-y-1.5">
                    <div className="flex h-6 items-center justify-between">
                        <span className={FIELD_LABEL}>Until</span>
                        <button
                            type="button"
                            onClick={() => {
                                setHasEndDate((value) => !value);
                                setEndDate(hasEndDate ? "" : whenStartDate);
                            }}
                            className={`flex min-h-9 cursor-pointer items-center rounded-lg px-2 text-[11px] font-medium transition-colors sm:-mr-2 ${hasEndDate ? "text-accent-primary" : "text-twilight-text-soft hover:text-twilight-text"}`}
                        >
                            {hasEndDate ? "Remove" : "Add end date"}
                        </button>
                    </div>
                    <DatePicker
                        label="Until"
                        value={endDate}
                        onChange={(date) => date && setEndDate(date)}
                        disabled={!hasEndDate}
                    />
                </div> : null}
            </div>
        </>
    );

    return (
        <Composer
            open
            title={composerTitle}
            icon={tab === "task" ? CalendarRange : event.icon}
            tone={tab === "task" ? "primary" : event.tone}
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
            ) : event.footer}
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

                        <PriorityField value={priority} onChange={setPriority} />
                        <EffortField value={effort} onChange={setEffort} />
                    </ComposerMore>
                </>
            ) : event.children}
        </Composer>
    );
}
