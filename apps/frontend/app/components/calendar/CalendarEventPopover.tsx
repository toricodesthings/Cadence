import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, CalendarHeart, CalendarRange, CalendarX, CheckSquare, Clock, Repeat, StickyNote } from "lucide-react";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { TimePicker } from "../primitives/TimePicker";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { FIELD_LABEL } from "../tasks/task-choice-options";
import { ComposerEffortRow, EffortField, PriorityField } from "../tasks/TaskWeightFields";
import { useComposerEffort } from "../../hooks/tasks/use-composer-effort";
import { DraftRow, useDraftChoices } from "../tasks/DraftRow";
import { addDays, atLocal, untilClause, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { addMinutesToTime, formatShortDateLabel, formatWallTime } from "../../lib/utils/date-format";
import { getUserZone } from "../../lib/utils/user-zone";
import { minutesToWallTime } from "../../lib/utils/calendar/calendar-dnd";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import type { DraftField } from "@cadence/domain/nlp-draft";
import { useTypedWhen } from "../../hooks/use-typed-when";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { DatePicker } from "../shared/DatePicker";
import {
    Composer,
    ComposerMore,
    ComposerRow,
    ComposerRows,
    ComposerTabs,
    ComposerTitle,
    ComposerToggle,
    COMPOSER_FIELD,
    ROW_PILL,
    WeekdayPicker,
    WEEKDAY_ORDER,
    type WeekdayCode,
} from "../shared/Composer";
import { usePersonalEventComposer } from "../events/PersonalEventEditorDialog";
import { useAddPersonalEvent } from "./AddPersonalEventDialog";
import type { TaskInteractionMode, TaskPriority } from "@cadence/contracts/task";

export interface CalendarEventInfo {
    /** Context creation opens this tab; an ordinary grid click opens Task. */
    tab?: "task" | "event";
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

type WhenRowsProps = {
    mode: ComposerMode;
    onMode: (next: ComposerMode) => void;
    date: LocalDate;
    start: string;
    end: string;
    onEdit: ReturnType<ReturnType<typeof useTypedWhen>["bind"]>["edit"];
    weekdays: WeekdayCode[];
    onWeekdays: (days: WeekdayCode[]) => void;
    endDate: LocalDate | "";
    setEndDate: (date: LocalDate | "") => void;
    hasEndDate: boolean;
    setHasEndDate: (update: (value: boolean) => boolean) => void;
    interactionMode: TaskInteractionMode;
    onInteractionMode: (mode: TaskInteractionMode) => void;
};

const REPEAT_OPTIONS = [{ value: "once", label: "Once" }, { value: "weekly", label: "Weekly" }] as const;

/** The when, as one grouped card: Starts (day + time), Ends, Repeat, and for a weekly series its days, Until and Fixed. */
function WhenRows({ mode, onMode, date, start, end, onEdit, weekdays, onWeekdays, endDate, setEndDate, hasEndDate, setHasEndDate, interactionMode, onInteractionMode }: WhenRowsProps) {
    const weekly = mode === "weekly";
    const fixed = interactionMode === "timetable";
    const time = <T extends "start" | "end">(key: T, value: string, label: string) => (
        <TimePicker label={label} value={value} onChange={(next) => onEdit({ [key]: next })} className={ROW_PILL} />
    );
    return (
        <>
            <ComposerRows>
                <ComposerRow icon={Calendar} label={weekly ? "From" : "Starts"}>
                    <DatePicker
                        label={weekly ? "From" : "Date"}
                        value={date}
                        className={ROW_PILL}
                        onChange={(next) => {
                            if (!next) return;
                            onEdit({ date: next });
                            if (weekly) onWeekdays([toWeekdayCode(next)]);
                        }}
                    />
                    {time("start", start, "Start time")}
                </ComposerRow>
                <ComposerRow icon={Clock} label="Ends">{time("end", end, "End time")}</ComposerRow>
                <ComposerRow icon={Repeat} label="Repeat" detail={weekly ? <WeekdayPicker value={weekdays} onChange={onWeekdays} /> : null}>
                    <SegmentedControl size="sm" ariaLabel="Repeat" value={mode} onChange={onMode} options={REPEAT_OPTIONS} />
                </ComposerRow>
                {weekly ? (
                    <ComposerRow icon={CalendarX} label="Until">
                        {hasEndDate ? <DatePicker label="Until" value={endDate} className={ROW_PILL} onChange={(next) => next && setEndDate(next)} /> : null}
                        <button
                            type="button"
                            onClick={() => {
                                setHasEndDate((value) => !value);
                                setEndDate(hasEndDate ? "" : date);
                            }}
                            className="flex min-h-10 cursor-pointer items-center rounded-full px-3 text-sm text-twilight-text-soft transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            {hasEndDate ? "Remove" : "Never"}
                        </button>
                    </ComposerRow>
                ) : null}
            </ComposerRows>
            {weekly ? (
                <ComposerToggle
                    label="Fixed"
                    description={fixed ? "It just passes if missed. No check-off." : "Still owed if missed. Carries over until checked off."}
                    checked={fixed}
                    onCheckedChange={(checked) => onInteractionMode(checked ? "timetable" : "task")}
                    ariaLabel="Make this a fixed block"
                />
            ) : null}
        </>
    );
}

function NotesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <label className="block">
            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                <StickyNote size={12} aria-hidden="true" />
                Notes
            </span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={2}
                className={`${COMPOSER_FIELD} resize-y`}
                placeholder="Room, context, why this block matters…"
            />
        </label>
    );
}

/** "Dinner with Sam Fri 7pm": the title's words, read for a day, time, priority and repeat until a field is touched. */
function useBlockWords(info: CalendarEventInfo, title: string, priority: TaskPriority, active: boolean) {
    const choices = useDraftChoices();
    const { dismissed, accepted, literal } = choices;
    const { data: userSettings } = useSettings();
    const intelligence = userSettings?.tasks?.intelligence;
    const startTime = minutesToWallTime(info.startHour * 60 + info.startMinute);
    const nlpOn = active && intelligence?.nlpEnabled !== false;
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
    });
    return { nlp, nlpOn, typed: typedWhen.bind(nlp), choices };
}

/**
 * Once or weekly: `null` until the person picks, so typed words ("every Mon and Wed") may choose for them.
 * Once keeps a repeat typed in words ("daily at 7am"); Repeats weekly uses the picked days.
 */
function useBlockRepeat(day: LocalDate, typedRule: string | null) {
    const [modeChoice, setMode] = useState<ComposerMode | null>(null);
    const [weekdayChoice, setWeekdays] = useState<WeekdayCode[] | null>(null);
    const [endDate, setEndDate] = useState<LocalDate | "">("");
    const [hasEndDate, setHasEndDate] = useState(false);
    const typedDays = weeklyDaysOf(typedRule);
    const mode: ComposerMode = modeChoice ?? (typedDays ? "weekly" : "once");
    const weekdays = weekdayChoice ?? typedDays ?? [toWeekdayCode(day)];
    const until = hasEndDate && endDate ? endDate : null;
    const recurrenceRule = mode === "weekly" ? buildWeeklyRule(weekdays, until) : typedRule;
    return { mode, setMode, weekdays, setWeekdays, endDate, setEndDate, hasEndDate, setHasEndDate, recurrenceRule };
}

/** The Task tab as a composer draft: a block on the clicked day, once or weekly. */
function useTaskBlockComposer(info: CalendarEventInfo, active: boolean, onClose: () => void) {
    const titleRef = useRef<HTMLInputElement>(null);
    const { mutate: createTask, isPending } = useCreateTask();
    // Phones lead with one line to type; the exact times wait under More.
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [interactionMode, setInteractionMode] = useState<TaskInteractionMode>("timetable");

    const { nlp, nlpOn, typed, choices } = useBlockWords(info, title, priority, active);
    const { literal } = choices;
    const repeat = useBlockRepeat(info.date, nlp.fields.recurrenceRule);
    const { mode, recurrenceRule } = repeat;
    const { date: whenStartDate, start: whenStartTime, end: whenEndTime } = typed.when;
    const submitTitle = nlp.cleanedTitle.trim() || title.trim();
    const effortChoice = useComposerEffort({ title: submitTitle, projectId: null, literal, open: active });
    const { effort } = effortChoice;

    const isDirty = Boolean(title.trim() || notes.trim() || mode === "weekly" || repeat.hasEndDate || priority > 0 || effort !== null);

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
                ...effortChoice.saved,
            },
            { onSuccess: onClose },
        );
    }, [createTask, effortChoice.saved, interactionMode, nlp.fields.priority, notes, onClose, priority, recurrenceRule, submitTitle, whenEndTime, whenStartDate, whenStartTime]);

    const timeRange = formatTimeRange(whenStartTime, whenEndTime);
    return {
        titleRef,
        isDirty,
        title: `Create on ${formatShortDateLabel(whenStartDate)}`,
        subtitle: recurrenceRule ? (summary?.label ?? "Repeats every week") : timeRange,
        submit: { onSubmit: handleTaskSubmit, submitLabel: submitLabelFor(isPending, mode), icon: CheckSquare, disabled: !submitTitle || isPending },
        children: (
            <>
                <ComposerTitle inputRef={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What, and when? e.g. Lunch with Sam Fri 1pm" aria-label="Block title" />

                {nlpOn ? (
                    <DraftRow
                        applied={nlp.applied}
                        suggestions={nlp.suggestions}
                        shownElsewhere={["due_date", "scheduled_start"]}
                        {...choices.row}
                    />
                ) : null}
                <ComposerEffortRow choice={effortChoice} />

                <WhenRows
                    mode={mode}
                    onMode={(next) => {
                        repeat.setMode(next);
                        // "Once" over a typed repeat: set the repeat aside, so its words go back to the title.
                        const typedRepeat = nlp.applied.find((e) => e.type === "recurrence");
                        if (next === "once" && typedRepeat) choices.dismiss(typedRepeat.id);
                    }}
                    date={whenStartDate}
                    start={whenStartTime}
                    end={whenEndTime}
                    onEdit={typed.edit}
                    weekdays={repeat.weekdays}
                    onWeekdays={repeat.setWeekdays}
                    endDate={repeat.endDate}
                    setEndDate={repeat.setEndDate}
                    hasEndDate={repeat.hasEndDate}
                    setHasEndDate={repeat.setHasEndDate}
                    interactionMode={interactionMode}
                    onInteractionMode={setInteractionMode}
                />

                <ComposerMore>
                    <NotesField value={notes} onChange={setNotes} />

                    <PriorityField value={priority} onChange={setPriority} />
                    <EffortField value={effort} onChange={effortChoice.set} />
                </ComposerMore>
            </>
        ),
    };
}

function submitLabelFor(isPending: boolean, mode: ComposerMode) {
    if (isPending) return "Saving…";
    return mode === "weekly" ? "Create series" : "Add to schedule";
}

export function CalendarEventPopover({ info, initialTab = "task", onClose }: CalendarEventPopoverProps) {
    const addPersonalEvent = useAddPersonalEvent();
    const [tab, setTab] = useState<ScheduleCreateTab>(initialTab);
    const task = useTaskBlockComposer(info, tab === "task", onClose);

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
        const id = requestAnimationFrame(() => (tab === "task" ? task.titleRef : event.titleRef).current?.focus());
        return () => cancelAnimationFrame(id);
    }, [tab, task.titleRef, event.titleRef]);

    const typeTabs = (
        <ComposerTabs
            role="tablist"
            ariaLabel="Create type"
            value={tab}
            onChange={setTab}
            options={[
                { id: "task", label: "Task", icon: CheckSquare },
                { id: "event", label: "Event", icon: CalendarHeart, activeClassName: "bg-accent-nav-schedule/15 text-accent-nav-schedule" },
            ]}
        />
    );
    const shown = tab === "task"
        ? { title: task.title, icon: CalendarRange, tone: "primary" as const, subtitle: task.subtitle, submit: task.submit, children: task.children }
        : { title: "Add event", icon: event.icon, tone: event.tone, subtitle: "Yearly personal event", submit: event.submit, children: event.children };

    return (
        <Composer
            open
            title={shown.title}
            icon={shown.icon}
            tone={shown.tone}
            subtitle={shown.subtitle}
            switcher={typeTabs}
            isDirty={task.isDirty || event.isDirty}
            discardTitle="Discard this schedule draft?"
            discardDescription="This will close the composer and lose any unsaved task or event details."
            onClose={onClose}
            submit={shown.submit}
        >
            {shown.children}
        </Composer>
    );
}
