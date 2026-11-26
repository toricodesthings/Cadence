import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { Calendar, CalendarDays, CalendarHeart, CheckSquare, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import type { SharedEvent } from "@cadence/contracts/personal-event";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { taskDay } from "@cadence/domain/task-recurrence";
import { dayHoursOf } from "@cadence/domain/find-time";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";
import { DatePicker } from "../shared/DatePicker";
import { Tip } from "../primitives/Tooltip";
import { EmptyState } from "../tasks/EmptyState";
import { SharedMark } from "../sharing/SharedMark";
import { TaskContextMenu } from "../tasks/TaskContextMenu";
import { PlanningOfferChip } from "../tasks/PlanningOfferChip";
import { PLACE_DROP, dayLabel, useWeekLoad } from "./PlaceSheet";
import { PlaceCaptureTray } from "./PlaceCaptureTray";
import { RoutineMark } from "../habits/RoutineMark";
import { Reveal } from "../shared/Reveal";
import {
    formatChipTime,
    formatShortDate,
    formatWeekdayLong,
    formatWeekdayNarrow,
    getWeekStart,
    toTimeValue,
} from "../../lib/utils/date-format";
import { getUserZone, useToday } from "../../lib/utils/user-zone";
import { dayLoads } from "../../lib/utils/task/day-load";
import { buildDayPulse, formatDayPulse, type DayPulseView } from "../../lib/utils/task/day-pulse";
import { formatDuration, scheduleKind, splitDay } from "../../lib/utils/calendar/schedule-day";
import { canFindTime, FindTimeDayContext } from "../../hooks/tasks/use-find-time";
import { PlanningOfferProvider, usePlanningOffers } from "../../hooks/ai/use-planning-offers";
import { useEffortGuess } from "../../hooks/tasks/use-effort-guess";
import { useDurationGuesser } from "../../hooks/ai/use-duration-guess";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";
import { useCaptureFeed } from "../../hooks/inbox/use-capture-feed";
import { useSettings } from "../../hooks/core/use-settings";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { useVirtualHabitTasks, type VirtualHabitTask } from "../../hooks/habits/use-virtual-habit-tasks";

const HOVER_WASH = "hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_12%,transparent)]";
const ROW =
    "surface-row flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-2xl px-2 hover:[--row-wash:color-mix(in_srgb,var(--color-twilight-text)_12%,transparent)]";
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary";
const ICON_CONTROL = `press flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-twilight-text-soft transition-[background-color,color] duration-150 ease-out ${HOVER_WASH} hover:text-twilight-text pointer-fine:min-h-9 pointer-fine:min-w-9 ${FOCUS_RING}`;

type DayMarks = { fixed: boolean; taskDots: 0 | 1 | 2; event: boolean };

function weekSpan(start: LocalDate, end: LocalDate) {
    const a = formatShortDate(start);
    const b = formatShortDate(end);
    if (start.slice(5, 7) !== end.slice(5, 7)) return `${a} – ${b}`;
    return /^\d/.test(a) ? `${Number(start.slice(8, 10))} – ${b}` : `${a} – ${Number(end.slice(8, 10))}`;
}

const minutesNow = () => {
    const [h, m] = toTimeValue(new Date().toISOString()).split(":").map(Number);
    return h * 60 + m;
};

export function HoldingPlannerPanel({
    onSelectTask,
    onClose,
}: {
    onSelectTask?: (taskId: string) => void;
    onClose?: () => void;
}) {
    const navigate = useNavigate();
    const todayIso = useToday();
    const shell = useShellMode();
    const canDrag = shell.isWide && !shell.isTouch;
    const reduced = useReducedMotionSetting();
    const { data: settings } = useSettings();
    const [weekStart, setWeekStart] = useState<LocalDate>(() => getWeekStart(todayIso));
    const [selected, setSelected] = useState<LocalDate>(todayIso);
    const [direction, setDirection] = useState(0);
    const [focusDay, setFocusDay] = useState<LocalDate | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const { tasks } = useWeekLoad(weekStart, true, 7);
    const guessOf = useEffortGuess();
    const durationOf = useDurationGuesser();
    const feed = useCaptureFeed();
    const dragging = Boolean(useDndContext().active);
    const zone = getUserZone();
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const personal = usePersonalEvents(Number(weekStart.slice(0, 4)));
    const eventsOn = (day: LocalDate): SharedEvent[] =>
        personal.enabled ? personal.items.filter((e) => e.monthDay === day.slice(5)) : [];

    const byDay = useMemo(() => {
        const map = new Map<LocalDate, Task[]>();
        for (const task of tasks) {
            if (task.isHabit) continue;
            const day = taskDay(task, zone);
            if (day) map.set(day, [...(map.get(day) ?? []), task]);
        }
        return map;
    }, [tasks, zone]);
    const owedLoads = dayLoads(
        tasks.filter((t) => scheduleKind(t) === "task"),
        weekStart,
        7,
        (t) => guessOf(t)?.level,
    );
    const marksOf = (day: LocalDate): DayMarks => {
        const list = byDay.get(day) ?? [];
        const owed = list.filter((t) => scheduleKind(t) === "task").length;
        const weight = owedLoads.get(day) ?? 0;
        return {
            fixed: list.some((t) => scheduleKind(t) === "fixed"),
            taskDots: owed === 0 ? 0 : owed >= 3 || weight > 3 ? 2 : 1,
            event: eventsOn(day).length > 0,
        };
    };
    const pulseOf = (day: LocalDate) =>
        formatDayPulse(
            buildDayPulse(day, byDay.get(day) ?? [], {
                eventCount: eventsOn(day).length,
                dayHours: dayHoursOf(settings),
                nowMin: day === todayIso ? minutesNow() : null,
                effortGuessOf: (t) => guessOf(t)?.level,
                durationGuessOf: durationOf,
                nlpEnabled: settings?.tasks.intelligence?.nlpEnabled !== false,
            }),
        );

    const dayTasks = byDay.get(selected) ?? [];
    const { timed, allDay } = splitDay(dayTasks);
    const dayEvents = eventsOn(selected);
    const weekRoutines = useVirtualHabitTasks({ start: weekStart, end: days[6], enabled: days[6] >= todayIso });
    const dayRoutines = routinesOf(
        (weekRoutines as VirtualHabitTask[]).filter((slot) => taskDay(slot, zone) === selected),
    );
    const offers = usePlanningOffers(dayTasks);
    const shownRoutines = selected < todayIso ? [] : dayRoutines;
    const pulse = pulseOf(selected);
    const isPast = selected < todayIso;
    const hasUnplaced = feed.tasks.length + feed.thoughts.length > 0;
    const thisWeek = getWeekStart(todayIso);

    const select = (day: LocalDate) => {
        const start = getWeekStart(day);
        if (start !== weekStart) {
            setDirection(start > weekStart ? 1 : -1);
            setWeekStart(start);
        }
        setSelected(day);
    };
    const shiftWeek = (by: 1 | -1) => select(addDays(weekStart, by * 7));
    const onGridKey = (e: KeyboardEvent) => {
        const by = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!by) return;
        e.preventDefault();
        const next = addDays(selected, by);
        select(next);
        setFocusDay(next);
    };
    useEffect(() => {
        if (!focusDay) return;
        gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
        setFocusDay(null);
    }, [focusDay, weekStart]);

    const emptyLine = isPast
        ? "Nothing was scheduled."
        : !hasUnplaced
          ? null
          : canDrag
            ? "Drop something on this day, or place one below."
            : "Tap Place on this day below to put something here.";
    const weekLabel = weekSpan(days[0], days[6]);

    return (
        <div className="photo-shell-surface surface-shell flex h-full flex-col">
            <header className="flex h-(--shell-header-h) shrink-0 items-center gap-3 border-b border-twilight-border pl-4 pr-[calc(1rem+var(--rail-toggle-reserve,0px))]">
                <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern">
                    <CalendarDays size={17} aria-hidden="true" />
                </div>
                <div className="min-w-0 leading-tight">
                    <h2 className="font-display text-lg font-semibold leading-tight tracking-tight text-twilight-text">
                        Place
                    </h2>
                    <span
                        className={`mt-0.5 block truncate text-[11px] font-medium leading-none ${canDrag && dragging ? "text-accent-primary" : "text-twilight-text-muted"}`}
                    >
                        {canDrag && dragging ? "Drop onto a day to place" : "Week summary"}
                    </span>
                </div>
                {onClose ? (
                    <Tip label="Close" side="bottom">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close Place"
                            className={`${ICON_CONTROL} ml-auto size-11`}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </Tip>
                ) : null}
            </header>

            <ScrollAreaWrapper>
                <div className="flex min-h-full flex-col gap-4 px-4 py-5">
                    <section aria-label="Week" className="surface-card rounded-[24px] p-2.5">
                        <div className="mb-1.5 flex items-center gap-1">
                            <DatePicker
                                label="Pick any date"
                                value={selected}
                                onChange={(date) => date && select(date)}
                                className="min-w-0 flex-1"
                            >
                                <button
                                    type="button"
                                    className={`press flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-2xl px-2 text-left text-sm font-medium text-twilight-text transition-[background-color] duration-150 ease-out ${HOVER_WASH} pointer-fine:min-h-9 ${FOCUS_RING}`}
                                >
                                    <Calendar size={15} aria-hidden="true" className="shrink-0 text-accent-primary" />
                                    <span className="truncate tabular-nums">{weekLabel}</span>
                                </button>
                            </DatePicker>
                            {selected !== todayIso || weekStart !== thisWeek ? (
                                <button
                                    type="button"
                                    onClick={() => select(todayIso)}
                                    className={`press surface-control min-h-9 shrink-0 cursor-pointer rounded-full px-2.5 text-xs font-medium text-twilight-text-soft hover:text-twilight-text ${FOCUS_RING}`}
                                >
                                    Today
                                </button>
                            ) : null}
                            <Tip label="Previous week" side="bottom">
                                <button
                                    type="button"
                                    onClick={() => shiftWeek(-1)}
                                    aria-label="Previous week"
                                    className={ICON_CONTROL}
                                >
                                    <ChevronLeft size={17} aria-hidden="true" />
                                </button>
                            </Tip>
                            <Tip label="Next week" side="bottom">
                                <button
                                    type="button"
                                    onClick={() => shiftWeek(1)}
                                    aria-label="Next week"
                                    className={ICON_CONTROL}
                                >
                                    <ChevronRight size={17} aria-hidden="true" />
                                </button>
                            </Tip>
                        </div>
                        <motion.div
                            key={weekStart}
                            ref={gridRef}
                            role="group"
                            aria-label={weekLabel}
                            onKeyDown={onGridKey}
                            initial={{ opacity: 0, x: direction * 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
                            className="grid grid-cols-7 gap-1"
                        >
                            {days.map((iso) => (
                                <DayTile
                                    key={iso}
                                    iso={iso}
                                    marks={marksOf(iso)}
                                    pulse={iso >= todayIso ? pulseOf(iso) : null}
                                    isToday={iso === todayIso}
                                    isPast={iso < todayIso}
                                    isSelected={iso === selected}
                                    canDrop={canDrag}
                                    dragging={dragging}
                                    onSelect={() => select(iso)}
                                />
                            ))}
                        </motion.div>
                    </section>

                    <section aria-live="polite" aria-label="Day" className="surface-card rounded-[24px] p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="flex min-w-0 items-baseline gap-2 font-display text-base font-semibold leading-none text-twilight-text">
                                <span className="truncate">
                                    {selected === todayIso ? "Today" : formatWeekdayLong(selected)}
                                </span>
                                <span className="shrink-0 font-display text-sm font-normal leading-none text-twilight-text-soft">
                                    {formatShortDate(selected)}
                                </span>
                            </h3>
                            <Tip label="Open this day in Schedule" side="bottom">
                                <button
                                    type="button"
                                    onClick={() => navigate(`/schedule?date=${selected}`)}
                                    className={`press -mr-1.5 flex min-h-11 shrink-0 cursor-pointer items-center gap-0.5 rounded-xl px-2 text-xs font-medium text-twilight-text-soft transition-[background-color,color] duration-150 ease-out ${HOVER_WASH} hover:text-twilight-text pointer-fine:min-h-8 ${FOCUS_RING}`}
                                >
                                    Schedule <ChevronRight size={14} aria-hidden="true" />
                                </button>
                            </Tip>
                        </div>
                        {isPast || pulse.kind === "wide_open" ? null : <DayPulsePill pulse={pulse} />}

                        {dayTasks.length || dayEvents.length || shownRoutines.length ? (
                            <FindTimeDayContext.Provider value={selected}>
                                <PlanningOfferProvider shown={offers.shown}>
                                    <ul className="mt-3 space-y-1">
                                        {shownRoutines.length ? (
                                            <li>
                                                <RoutinesLine routines={shownRoutines} />
                                            </li>
                                        ) : null}
                                        {dayEvents.map((event) => (
                                            <li
                                                key={event.id}
                                                className="flex min-h-11 items-center gap-2.5 rounded-2xl px-2"
                                            >
                                                <span
                                                    className="flex w-5 shrink-0 justify-center text-[15px] leading-none"
                                                    aria-hidden="true"
                                                >
                                                    {event.emoji ?? (
                                                        <CalendarHeart size={14} className="text-solstice" />
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm text-twilight-text">
                                                    {event.label}
                                                </span>
                                                <span className="shrink-0 text-xs text-twilight-text-muted">Event</span>
                                            </li>
                                        ))}
                                        {[...timed, ...allDay].map((task) => (
                                            <li key={task.id}>
                                                <div className="flex items-center gap-0.5">
                                                    <DayRow task={task} onSelect={() => onSelectTask?.(task.id)} />
                                                    {canFindTime(task) ? <TaskContextMenu task={task} /> : null}
                                                </div>
                                                {offers.task?.id === task.id && offers.kind ? (
                                                    <div className="px-2 pb-1 pt-1">
                                                        <PlanningOfferChip
                                                            kind={offers.kind}
                                                            onAccept={() => {
                                                                offers.accept();
                                                                if (offers.kind === "steps") onSelectTask?.(task.id);
                                                            }}
                                                            onNotNow={offers.notNow}
                                                        />
                                                    </div>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </PlanningOfferProvider>
                            </FindTimeDayContext.Provider>
                        ) : null}
                        {dayTasks.length || dayEvents.length ? null : (
                            <EmptyState
                                variant="place"
                                size="inline"
                                title={isPast ? "A quiet day." : undefined}
                                description={emptyLine}
                            />
                        )}

                        {isPast ? null : <PlaceCaptureTray day={selected} />}
                    </section>
                </div>
            </ScrollAreaWrapper>
        </div>
    );
}

type DayRoutine = { id: string; title: string; emoji: string | null; done: boolean };

function routinesOf(slots: readonly VirtualHabitTask[]): DayRoutine[] {
    const byId = new Map<string, DayRoutine>();
    for (const slot of slots) {
        const id = slot.id.split("--")[0];
        const seen = byId.get(id);
        const done = slot.state === "COMPLETE";
        if (seen) seen.done = seen.done && done;
        else byId.set(id, { id, title: slot.title, emoji: slot.habitEmoji ?? null, done });
    }
    return [...byId.values()];
}

function RoutinesLine({ routines }: { routines: DayRoutine[] }) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    if (routines.length === 0) return null;
    const shown = [...routines].sort((a, b) => Number(!a.emoji) - Number(!b.emoji)).slice(0, 5);
    const more = routines.length - shown.length;
    const done = routines.filter((r) => r.done).length;
    return (
        <div>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((o) => !o)}
                className={`press ${ROW} cursor-pointer text-left text-sm text-twilight-text-soft hover:text-twilight-text ${FOCUS_RING}`}
            >
                <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                    {shown.map((r) => (
                        <RoutineMark
                            key={r.id}
                            emoji={r.emoji}
                            size={12}
                            className={`text-twilight-text-muted ${r.done ? "opacity-50" : ""}`}
                        />
                    ))}
                    {more > 0 ? <span className="tabular-nums text-twilight-text-muted">+{more}</span> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                    {routines.length} {routines.length === 1 ? "routine" : "routines"}
                    {done ? ` · ${done} done` : ""}
                </span>
                <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className={`shrink-0 text-twilight-text-muted transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
                />
            </button>
            <Reveal open={open} id={listId}>
                <ul aria-label="Routines" className="space-y-1.5 px-2 pb-2 pt-2">
                    {routines.map((routine) => (
                        <li
                            key={routine.id}
                            className={`flex min-w-0 items-center gap-2 text-xs text-twilight-text-soft ${routine.done ? "opacity-60" : ""}`}
                        >
                            <span className="flex w-5 shrink-0 justify-center">
                                <RoutineMark emoji={routine.emoji} size={12} className="text-twilight-text-muted" />
                            </span>
                            <span className={`truncate ${routine.done ? "line-through decoration-1" : ""}`}>
                                {routine.title}
                            </span>
                            {routine.done ? <span className="sr-only">, done</span> : null}
                        </li>
                    ))}
                </ul>
            </Reveal>
        </div>
    );
}

function DayPulsePill({ pulse }: { pulse: DayPulseView }) {
    const accent = pulse.tone === "open" || pulse.tone === "light";
    const event = pulse.kind === "event_only";
    const Icon = pulse.Icon;
    return (
        <Tip label={pulse.breakdown} side="bottom">
            <button
                type="button"
                aria-label={`${pulse.label}. ${pulse.breakdown}`}
                className={`mt-2.5 inline-flex min-h-8 cursor-default items-center gap-1.5 rounded-full px-3 text-xs font-medium ${accent ? "surface-control-accent text-twilight-text" : "surface-control text-twilight-text-soft"} ${FOCUS_RING}`}
                style={event ? ({ "--control-tone": "var(--color-solstice)" } as CSSProperties) : undefined}
            >
                <Icon
                    size={13}
                    aria-hidden="true"
                    className={event ? "text-solstice" : accent ? "text-accent-primary" : "text-twilight-text-muted"}
                />
                {pulse.label}
            </button>
        </Tip>
    );
}

function DayRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
    const durationOf = useDurationGuesser();
    const fixed = scheduleKind(task) === "fixed";
    const guess = durationOf(task);
    const size = task.durationEstimate ?? (guess?.state === "supported" ? guess.minutes : null);
    const meta = task.scheduledStart
        ? formatChipTime(task.scheduledStart, task.scheduledEnd)
        : size
          ? `~${formatDuration(size)}`
          : null;
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`press ${ROW} flex-1 cursor-pointer py-1.5 text-left ${FOCUS_RING}`}
        >
            <span className="flex w-5 shrink-0 justify-center" aria-hidden="true">
                {fixed ? (
                    <span className="h-4 w-1 rounded-full bg-moonlit/75" />
                ) : task.scheduledStart ? (
                    <Clock size={14} className="text-accent-primary/85" />
                ) : (
                    <CheckSquare size={14} className="text-twilight-text-soft" />
                )}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="line-clamp-2 break-words text-sm leading-snug text-twilight-text">{task.title}</span>
                <SharedMark task={task} interactive={false} />
            </span>
            {meta ? (
                <span
                    className={`shrink-0 text-xs tabular-nums ${fixed ? "text-moonlit/90" : "text-twilight-text-soft"}`}
                >
                    {meta}
                </span>
            ) : null}
        </button>
    );
}

function DayTile({
    iso,
    marks,
    pulse,
    isToday,
    isPast,
    isSelected,
    canDrop,
    dragging,
    onSelect,
}: {
    iso: LocalDate;
    marks: DayMarks;
    pulse: DayPulseView | null;
    isToday: boolean;
    isPast: boolean;
    isSelected: boolean;
    canDrop: boolean;
    dragging: boolean;
    onSelect: () => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: PLACE_DROP + iso, disabled: isPast || !canDrop });
    const tone = isOver
        ? "scale-[1.04] ring-2 ring-accent-primary bg-accent-primary/20"
        : isSelected
          ? "surface-control-accent ring-1 ring-accent-primary/45"
          : dragging && canDrop && !isPast
            ? `outline-dashed outline-1 -outline-offset-1 outline-accent-primary/35 ${HOVER_WASH}`
            : HOVER_WASH;
    const label = [dayLabel(iso), isToday ? "Today" : null, pulse?.label].filter(Boolean).join(", ");
    return (
        <button
            ref={setNodeRef}
            type="button"
            data-day={iso}
            data-initial-focus={isSelected || undefined}
            onClick={onSelect}
            aria-pressed={isSelected}
            aria-label={label}
            className={`press-none relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl py-2 transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out ${tone} ${isPast ? "opacity-40" : ""} ${FOCUS_RING}`}
        >
            <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? "text-accent-primary" : "text-twilight-text-muted"}`}
            >
                {formatWeekdayNarrow(iso)}
            </span>
            <span
                className={`font-display text-lg font-semibold leading-none ${isToday ? "text-accent-primary" : "text-twilight-text"}`}
            >
                {Number(iso.slice(8, 10))}
            </span>
            <span className="flex h-2 items-center gap-0.5" aria-hidden="true">
                {!isPast && marks.fixed ? <span className="h-1 w-3 rounded-full bg-moonlit/75" /> : null}
                {!isPast
                    ? Array.from({ length: marks.taskDots }, (_, i) => (
                          <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent-primary/80" />
                      ))
                    : null}
            </span>
            {!isPast && marks.event ? (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-solstice" aria-hidden="true" />
            ) : null}
        </button>
    );
}
