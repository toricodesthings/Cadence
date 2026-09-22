import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Flag, Inbox, Plus } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import type { HolidayRecord } from "../../../lib/holidays/provider";
import type { PersonalEvent } from "../../../types/settings";
import { formatTime, toISODate } from "../../../lib/utils/date-format";
import { formatDuration, freeGaps, itemEnd, itemStart, scheduleKind, splitDay, type FreeGap } from "../../../lib/utils/calendar/schedule-day";
import { useMinuteClock } from "../../../hooks/ui/use-realtime-clock";
import { ScheduleRow, type ScheduleRowHandlers } from "./ScheduleRow";

/** Swiping to another day remounts this view, so the offset outlives it: the
 *  same time of day stays in view, the way a native calendar behaves. */
let lastDayScrollTop = 0;

export interface DayAgendaProps extends ScheduleRowHandlers {
    dateIso: string;
    tasks: Task[];
    holidays?: HolidayRecord[];
    isBirthday?: boolean;
    personalEvents?: PersonalEvent[];
    routineEmoji: (task: Task) => string | null;
    /** Ready-to-place tasks waiting in Holding. */
    hasReady?: boolean;
    onOpenReady?: () => void;
    /** Create something starting at `start`, `minutes` long. */
    onAddAt: (start: Date, minutes: number) => void;
    dragActive?: boolean;
    reducedMotion?: boolean;
}

const SECTION_LABEL = "px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted";

/** Round up to the next quarter hour, so "add into this gap" lands on a clean time. */
function nextQuarter(date: Date) {
    const next = new Date(date);
    next.setSeconds(0, 0);
    next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15);
    return next;
}

/**
 * One day, in the order it happens: what the day is (holidays, birthdays,
 * events), what has no time, then timed things with a "now" line and the free
 * stretches between them. On today, what's already behind folds away.
 */
export function DayAgenda({
    dateIso,
    tasks,
    holidays = [],
    isBirthday = false,
    personalEvents = [],
    routineEmoji,
    hasReady = false,
    onOpenReady,
    onAddAt,
    dragActive,
    reducedMotion,
    ...handlers
}: DayAgendaProps) {
    const now = useMinuteClock();
    const todayIso = toISODate(now);
    const isToday = dateIso === todayIso;
    const [showEarlier, setShowEarlier] = useState(false);
    const [showDoneRoutines, setShowDoneRoutines] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = Math.min(lastDayScrollTop, Math.max(0, node.scrollHeight - node.clientHeight));
    }, [dateIso]);

    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        lastDayScrollTop = event.currentTarget.scrollTop;
    }, []);

    const { allDay, earlier, upcoming, gapsAfter, current, next } = useMemo(() => {
        const { allDay, timed } = splitDay(tasks);
        const earlier = isToday ? timed.filter((task) => itemEnd(task) <= now) : [];
        const upcoming = isToday ? timed.filter((task) => itemEnd(task) > now) : timed;
        const gapsAfter = new Map<string, FreeGap>();
        for (const gap of freeGaps(upcoming, isToday ? now : null)) gapsAfter.set(gap.afterId, gap);
        return {
            allDay,
            earlier,
            upcoming,
            gapsAfter,
            current: isToday ? upcoming.find((task) => scheduleKind(task) !== "routine" && itemStart(task) <= now) ?? null : null,
            next: isToday ? upcoming.find((task) => itemStart(task) > now) ?? null : null,
        };
    }, [isToday, now, tasks]);

    const allDayOpen = allDay.filter((task) => !(task.isHabit && task.state === "COMPLETE"));
    const allDayDone = allDay.filter((task) => task.isHabit && task.state === "COMPLETE");
    const nowIndex = isToday ? upcoming.findIndex((task) => itemStart(task) > now) : -2;
    const hasMarkers = holidays.length > 0 || isBirthday || personalEvents.length > 0;
    const isEmpty = tasks.length === 0;

    const row = (task: Task, past = false) => (
        <ScheduleRow
            key={task.id}
            task={task}
            routineEmoji={routineEmoji(task)}
            past={past}
            dragActive={dragActive}
            reducedMotion={reducedMotion}
            {...handlers}
        />
    );

    const gapRow = (gap: FreeGap) => (
        <button
            key={`gap-${gap.afterId}`}
            type="button"
            onClick={() => onAddAt(nextQuarter(gap.start), Math.min(60, gap.minutes))}
            className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            aria-label={`Free until ${formatTime(gap.end.toISOString())}, ${formatDuration(gap.minutes)}. Add something here`}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true">
                <span className="h-6 w-px border-l border-dashed border-twilight-text-muted/60" />
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-twilight-text-soft">
                Free until {formatTime(gap.end.toISOString())}
                <span className="text-twilight-text-muted"> · {formatDuration(gap.minutes)}</span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-twilight-text-soft transition-colors group-hover:bg-white/[0.06] group-hover:text-accent-primary" aria-hidden="true">
                <Plus size={16} />
            </span>
        </button>
    );

    const nowLine = (
        <div key="now" className="flex items-center gap-2 px-2 py-2" role="note" aria-label={`Now, ${formatTime(now.toISOString())}`}>
            <span className="flex w-11 shrink-0 justify-center" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-accent-primary shadow-[0_0_10px_color-mix(in_srgb,var(--accent-primary)_55%,transparent)]" />
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-accent-primary">{formatTime(now.toISOString())}</span>
            <span className="h-px flex-1 bg-accent-primary/40" aria-hidden="true" />
            <span className="max-w-[55%] truncate text-[12px] text-accent-primary/90">
                {current
                    ? `${current.title} until ${formatTime(itemEnd(current).toISOString())}`
                    : next
                        // The free-time row below already says how long; say it once.
                        ? gapsAfter.has("now")
                            ? `Next: ${next.title}`
                            : `Next: ${next.title} in ${formatDuration(Math.max(1, Math.floor((itemStart(next).getTime() - now.getTime()) / 60_000)))}`
                        : "Nothing else timed"}
            </span>
        </div>
    );

    return (
        <div ref={scrollRef} onScroll={handleScroll} className="touch-scroll-y h-full min-h-0 px-3 pb-36">
            {hasMarkers ? (
                <div className="flex flex-wrap gap-1.5 px-1 pt-3">
                    {holidays.map((holiday) => (
                        <span key={holiday.name} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-solstice/20 bg-solstice/12 px-3 text-xs font-medium text-solstice">
                            <Flag size={12} strokeWidth={2.2} aria-hidden="true" />
                            {holiday.name}
                        </span>
                    ))}
                    {isBirthday ? (
                        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-violet/20 bg-violet/12 px-3 text-xs font-medium text-violet">
                            <span aria-hidden="true">🎂</span> Your birthday
                        </span>
                    ) : null}
                    {personalEvents.map((event) => (
                        <span key={event.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/12 px-3 text-xs font-medium text-accent-nav-schedule">
                            <span aria-hidden="true">{event.emoji ?? "✦"}</span> {event.label}
                        </span>
                    ))}
                </div>
            ) : null}

            {hasReady && dateIso >= todayIso && onOpenReady ? (
                <button
                    type="button"
                    onClick={onOpenReady}
                    className="mx-1 mt-3 flex min-h-11 w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2.5 rounded-2xl border border-dashed border-accent-primary/30 px-3 text-left text-[13px] text-twilight-text-soft transition-colors hover:bg-accent-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    <Inbox size={15} className="shrink-0 text-accent-primary" aria-hidden="true" />
                    <span className="flex-1">Things are ready to place</span>
                    <span className="text-accent-primary">Place here</span>
                </button>
            ) : null}

            {isEmpty ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                    <p className="font-display text-lg font-semibold text-twilight-text">Nothing planned</p>
                    <p className="text-sm text-twilight-text-soft">The day is open.</p>
                    <button
                        type="button"
                        onClick={() => {
                            const start = new Date(`${dateIso}T09:00:00`);
                            onAddAt(isToday ? nextQuarter(new Date(Math.max(now.getTime(), start.getTime()))) : start, 60);
                        }}
                        className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-twilight-border/40 px-4 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <Plus size={15} aria-hidden="true" />
                        Add something
                    </button>
                </div>
            ) : null}

            {allDay.length > 0 ? (
                <section aria-label="Any time">
                    <h3 className={SECTION_LABEL}>Any time</h3>
                    {allDayOpen.map((task) => row(task))}
                    {allDayDone.length > 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowDoneRoutines((value) => !value)}
                                aria-expanded={showDoneRoutines}
                                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-2xl px-3 text-[13px] text-twilight-text-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${showDoneRoutines ? "rotate-180" : ""}`} />
                                {allDayDone.length} done
                            </button>
                            {showDoneRoutines ? allDayDone.map((task) => row(task)) : null}
                        </>
                    ) : null}
                </section>
            ) : null}

            {!isEmpty && (earlier.length > 0 || upcoming.length > 0 || isToday) ? (
                <section aria-label="Timeline">
                    {allDay.length > 0 || hasMarkers ? <h3 className={SECTION_LABEL}>Timeline</h3> : null}
                    {earlier.length > 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowEarlier((value) => !value)}
                                aria-expanded={showEarlier}
                                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-2xl px-3 text-[13px] text-twilight-text-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${showEarlier ? "rotate-180" : ""}`} />
                                Earlier today
                            </button>
                            {showEarlier ? earlier.map((task) => row(task, true)) : null}
                        </>
                    ) : null}
                    {isToday && (nowIndex === 0 || upcoming.length === 0) ? nowLine : null}
                    {isToday ? (gapsAfter.get("now") ? gapRow(gapsAfter.get("now")!) : null) : null}
                    {upcoming.map((task, index) => (
                        <Fragment key={task.id}>
                            {isToday && index === nowIndex && index > 0 ? nowLine : null}
                            {row(task)}
                            {gapsAfter.get(task.id) ? gapRow(gapsAfter.get(task.id)!) : null}
                            {isToday && nowIndex === -1 && index === upcoming.length - 1 ? nowLine : null}
                        </Fragment>
                    ))}
                </section>
            ) : null}
        </div>
    );
}
