import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarHeart, CalendarRange, Clock3, StickyNote } from "lucide-react";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { FIELD_LABEL } from "../tasks/task-choice-options";
import { AcceptedEffort, EffortField, EffortSuggestionRow, PriorityField } from "../tasks/TaskWeightFields";
import { useEffortSuggestion } from "../../hooks/tasks/use-effort-suggestion";
import { DraftRow } from "../tasks/DraftRow";
import { addDays, atLocal, untilClause, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { addMinutesToTime, formatShortDateLabel, formatWallTime } from "../../lib/utils/date-format";
import { getUserZone } from "../../lib/utils/user-zone";
import { minutesToWallTime } from "../../lib/utils/calendar/calendar-dnd";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import type { DraftField } from "@cadence/domain/nlp-draft";
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
    /** The day the draft sits on */
    date: LocalDate;
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

function toWeekdayCode(date: LocalDate): WeekdayCode {
    return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"][weekdayOf(date)] ?? "MO") as WeekdayCode;
}

function formatTimeRange(startTime: string, endTime: string) {
    return `${formatWallTime(startTime)} – ${formatWallTime(endTime)}`;
}

/** The block's start and end instants in the user's zone; an end at or before the start runs into the next day. */
function blockInstants(day: LocalDate, startTime: string, endTime: string) {
    const zone = getUserZone();
    const start = atLocal(day, startTime, zone);
    const end = atLocal(endTime <= startTime ? addDays(day, 1) : day, endTime, zone);
    return { start, end };
}

function buildWeeklyRule(days: WeekdayCode[], endDate: LocalDate | null) {
    const orderedDays = WEEKDAY_ORDER.filter((day) => days.includes(day));
    const base = `FREQ=WEEKLY;BYDAY=${orderedDays.join(",")}`;
    return endDate ? `${base};${untilClause(endDate)}` : base;
}

/** What a calendar block can store from typed words. */
const TASK_BLOCK_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>(["dueDate", "scheduledStart", "scheduledEnd", "durationMinutes", "priority", "recurrenceRule"]);

/** The days of a plain weekly rule ("every Mon and Wed"), which the weekday picker can show; anything richer stays a typed rule. */
const weeklyDaysOf = (rule: string | null) => (/^FREQ=WEEKLY;BYDAY=([A-Z,]+)$/.exec(rule ?? "")?.[1].split(",") as WeekdayCode[] | undefined) ?? null;

export function CalendarEventPopover({ info, initialTab = "task", onClose }: CalendarEventPopoverProps) {
    const taskTitleRef = useRef<HTMLInputElement>(null);
    const { mutate: createTask, isPending } = useCreateTask();
    const addPersonalEvent = useAddPersonalEvent();

    const [tab, setTab] = useState<ScheduleCreateTab>(initialTab);
    // Phones lead with one line to type; the exact times wait under More.
    const isPhone = useShellMode().isPhone;

    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    // `null` until the person picks: typed words ("every Mon and Wed") may choose for them.
    const [modeChoice, setMode] = useState<ComposerMode | null>(null);
    const [endDate, setEndDate] = useState<LocalDate | "">("");
    const [hasEndDate, setHasEndDate] = useState(false);
    const [weekdayChoice, setWeekdays] = useState<WeekdayCode[] | null>(null);
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [effort, setEffortValue] = useState<EffortLevel>(null);
    // Effort is the person's: a hand-set value (or clear) beats any suggestion, and one they accepted is recorded as accepted.
    const [effortOrigin, setEffortOrigin] = useState<"manual" | "accepted" | null>(null);
    const [effortTouched, setEffortTouched] = useState(false);
    const [effortDismissed, setEffortDismissed] = useState(false);
    const setEffort = (value: EffortLevel) => { setEffortValue(value); setEffortOrigin(value ? "manual" : null); setEffortTouched(true); };
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [accepted, setAccepted] = useState<string[]>([]);
    const [literal, setLiteral] = useState(false);
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
    const startTime = minutesToWallTime(info.startHour * 60 + info.startMinute);
    const nlpOn = tab === "task" && intelligence?.nlpEnabled !== false;
    const typedWhen = useTypedWhen({ date: info.date, allDay: false, start: startTime, end: addMinutesToTime(startTime, info.durationMinutes ?? 60) }, nlpOn);
    const nlp = useNlpParse({
        input: title,
        projects: [],
        tags: [],
        dismissedEntityIds: dismissed,
        acceptedEntityIds: accepted,
        literal,
        manual: { ...typedWhen.manual, ...(priority > 0 && { priority }) },
        capabilities: TASK_BLOCK_FIELDS,
        enabled: nlpOn,
        sourceSurface: "quick_add",
        dateStyle: userSettings?.dateTime?.dateStyle ?? "mdy",
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
    });
    const typed = typedWhen.bind(nlp);
    const typedDays = weeklyDaysOf(nlp.fields.recurrenceRule);
    const mode: ComposerMode = modeChoice ?? (typedDays ? "weekly" : "once");
    const weekdays = weekdayChoice ?? typedDays ?? [toWeekdayCode(info.date)];
    const { date: whenStartDate, start: whenStartTime, end: whenEndTime } = typed.when;
    const submitTitle = nlp.cleanedTitle.trim() || title.trim();
    const effortSuggestion = useEffortSuggestion({ title: submitTitle, projectId: null, chosen: effortTouched ? effort : undefined, dismissed: effortDismissed, literal, open: tab === "task" });

    const taskDirty = Boolean(title.trim() || notes.trim() || mode === "weekly" || hasEndDate || priority > 0 || effort !== null);
    const isDirty = taskDirty || event.isDirty;

    // Once: a repeat typed in words ("daily at 7am") still stands; Repeats weekly: the picked days.
    const recurrenceRule = mode === "weekly" ? buildWeeklyRule(weekdays, hasEndDate && endDate ? endDate : null) : nlp.fields.recurrenceRule;
    const summary = useMemo(
        () => {
            if (!recurrenceRule) return null;
            const { start, end } = blockInstants(whenStartDate, whenStartTime, whenEndTime);
            return getTaskRecurrenceSummary({ recurrenceRule, scheduledStart: start, scheduledEnd: end });
        },
        [recurrenceRule, whenStartDate, whenStartTime, whenEndTime],
    );

    const handleTaskSubmit = useCallback(() => {
        if (!submitTitle) return;

        const { start, end } = blockInstants(whenStartDate, whenStartTime, whenEndTime);

        createTask(
            {
                title: submitTitle,
                content: notes.trim() || null,
                orderIndex: Date.now(),
                scheduledStart: start,
                scheduledEnd: end,
                timezoneLocked: Boolean(recurrenceRule),
                recurrenceRule: recurrenceRule ?? undefined,
                interactionMode: recurrenceRule ? interactionMode : "task",
                priority: (priority || nlp.fields.priority) as TaskPriority,
                effort,
                ...(effort && effortOrigin && { effortOrigin }),
            },
            { onSuccess: onClose },
        );
    }, [createTask, effort, effortOrigin, interactionMode, nlp.fields.priority, notes, onClose, priority, recurrenceRule, submitTitle, whenEndTime, whenStartDate, whenStartTime]);

    const taskSubtitle = recurrenceRule ? (summary?.label ?? "Repeats every week") : formatTimeRange(whenStartTime, whenEndTime);

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
                    <ComposerTitle inputRef={taskTitleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What, and when? e.g. Lunch with Sam Fri 1pm" aria-label="Block title" />

                    {nlpOn ? (
                        <DraftRow
                            applied={nlp.applied}
                            suggestions={nlp.suggestions}
                            shownElsewhere={["due_date", "scheduled_start"]}
                            literal={literal}
                            onDismiss={(id) => setDismissed((current) => [...current, id])}
                            onAccept={(id) => setAccepted((current) => [...current, id])}
                            onLiteral={setLiteral}
                        />
                    ) : null}
                    {effort && effortOrigin === "accepted" ? (
                        <AcceptedEffort level={effort} onUndo={() => { setEffortValue(null); setEffortOrigin(null); setEffortTouched(false); }} />
                    ) : effortSuggestion ? (
                        <EffortSuggestionRow
                            suggestion={effortSuggestion}
                            onUse={(level) => { setEffortValue(level); setEffortOrigin("accepted"); setEffortTouched(true); }}
                            onDismiss={() => setEffortDismissed(true)}
                        />
                    ) : null}

                    <ComposerTabs
                        ariaLabel="Repeat"
                        value={mode}
                        onChange={(next) => {
                            setMode(next);
                            // "Once" over a typed repeat: set the repeat aside, so its words go back to the title.
                            const typedRepeat = nlp.applied.find((e) => e.type === "recurrence");
                            if (next === "once" && typedRepeat) setDismissed((current) => [...current, typedRepeat.id]);
                        }}
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
