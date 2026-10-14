import { useRef, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Flag } from "lucide-react";
import { TimeGutter } from "./TimeGutter";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { CalendarHoverContext } from "./CalendarItem";
import { TimedCalendarColumn } from "./TimedCalendarColumn";
import { RoutineStrip } from "./RoutineChips";
import { AllDayDropLane, AllDayDropPreview } from "./CalendarDropTargets";
import * as Popover from "../primitives/Popover";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT } from "../../lib/utils/calendar/calendar-utils";
import { useToday } from "../../lib/utils/user-zone";
import { type CalendarDropPreview } from "../../lib/utils/calendar/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "@cadence/contracts/task";
import type { HolidayRecord } from "@cadence/contracts/proxy";
import type { PersonalEvent } from "../../types/settings";

export interface DayViewProps {
    /** The LocalDate being shown */
    currentDate: string;
    /** All tasks for this day */
    tasks: Task[];
    holidays?: HolidayRecord[];
    /** Whether this day is the user's birthday */
    isBirthday?: boolean;
    /** Personal events occurring on this day */
    personalEvents?: PersonalEvent[];
    activeDropPreview?: CalendarDropPreview | null;
    /** Ghost block placement for click-to-create preview */
    draftPlacement?: { dateStr: string; startMinute: number; endMinute: number } | null;
    onSelectTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
    /** The hour the timeline opens scrolled to. */
    startHour?: number;
}

/** Chips size to their words and wrap; two rows show, the rest sit behind "+N more". */
function AllDayChips({ tasks, sourceId, onSelectTask }: {
    tasks: Task[];
    sourceId: string;
    onSelectTask: (taskId: string) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [firstHidden, setFirstHidden] = useState(tasks.length);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            let hiddenAt = tasks.length;
            Array.from(el.querySelectorAll<HTMLElement>("[data-lane-chip]")).forEach((chip, index) => {
                if (el.clientHeight > 0 && chip.offsetTop + chip.offsetHeight > el.clientHeight && hiddenAt === tasks.length) hiddenAt = index;
            });
            setFirstHidden(hiddenAt);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [tasks]);

    const hidden = tasks.slice(firstHidden);
    const chip = (t: Task) => (
        <CalendarTaskChip
            key={t.id}
            task={t}
            variant="pill"
            fit
            sourceId={sourceId}
            onSelect={onSelectTask}
        />
    );

    return (
        <div className="flex flex-col gap-1">
            <div ref={ref} className="relative flex max-h-[5.125rem] flex-wrap gap-1.5 overflow-hidden [@media(max-height:760px)]:max-h-[2.375rem]">
                {tasks.map((t, index) => (
                    <div key={t.id} data-lane-chip className="flex max-w-full" inert={index >= firstHidden}>
                        {chip(t)}
                    </div>
                ))}
            </div>
            {hidden.length > 0 && (
                <Popover.Root>
                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="w-fit text-[11px] text-twilight-text-muted hover:text-accent-primary transition-colors cursor-pointer px-1 py-0.5 rounded-lg hover:bg-twilight-border/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            +{hidden.length} more
                        </button>
                    </Popover.Trigger>
                    <Popover.Content side="bottom" align="start" className="w-64 p-2 flex flex-col gap-[3px]">
                        {hidden.map((t) => (
                            <CalendarTaskChip
                                key={t.id}
                                task={t}
                                variant="pill"
                                sourceId={sourceId}
                                onSelect={onSelectTask}
                            />
                        ))}
                    </Popover.Content>
                </Popover.Root>
            )}
        </div>
    );
}

export function DayView({
    currentDate,
    tasks,
    holidays = [],
    isBirthday = false,
    personalEvents = [],
    activeDropPreview,
    draftPlacement,
    onSelectTask,
    onResizeTask,
    onGridClick,
    startHour = 7,
}: DayViewProps) {
    const isToday = currentDate === useToday();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Open at the user's chosen hour (7 AM by default)
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = startHour * HOUR_HEIGHT;
        }
    }, [currentDate, startHour]);

    const { allDay, anytime, timed } = useMemo(() => {
        const open = tasks.filter((t) => !t.scheduledStart);
        return {
            allDay: open.filter((t) => !t.isHabit),
            anytime: open.filter((t) => t.isHabit),
            timed: tasks.filter((t) => !!t.scheduledStart),
        };
    }, [tasks]);
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
    const hover = useMemo(() => ({ series: hoveredSeries, setSeries: setHoveredSeries }), [hoveredSeries]);

    return (
        <CalendarHoverContext.Provider value={hover}>
        <div className="surface-card m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:m-3">
            {/* All-day area — date header suppressed; ScheduleHeader is the single source of truth */}
            <div className="shrink-0 border-b border-twilight-border/30 flex gap-0">
                {/* Gutter with "All day" label */}
                <div className="w-14 shrink-0 flex flex-col justify-end pb-2 pr-2.5">
                    <span className="text-[10px] text-twilight-text-muted/90 uppercase tracking-widest text-right select-none">
                        All day
                    </span>
                </div>
                <AllDayDropLane
                    dateStr={currentDate}
                    className="flex-1 px-4 py-2"
                    isActive={activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === currentDate}
                >
                    <div className={`flex flex-col gap-1 ${allDay.length === 0 ? "min-h-11" : ""}`}>
                        {holidays.length > 0 && (
                            <div className="mb-1 inline-flex max-w-fit items-center gap-2 rounded-full border border-solstice/20 bg-solstice/12 px-3 py-1 text-xs font-medium text-solstice">
                                <Flag size={12} strokeWidth={2.2} aria-hidden="true" />
                                {holidays.map((holiday) => holiday.name).join(", ")}
                            </div>
                        )}
                        {isBirthday && (
                            <div className="mb-1 inline-flex max-w-fit items-center gap-2 rounded-full border border-violet/20 bg-violet/12 px-3 py-1 text-xs font-medium text-violet">
                                🎂 Your Birthday
                            </div>
                        )}
                        {personalEvents.map((evt) => (
                            <div key={evt.id} className="mb-1 inline-flex max-w-fit items-center gap-2 rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/12 px-3 py-1 text-xs font-medium text-accent-nav-schedule">
                                {evt.emoji ?? "🎉"} {evt.label}
                            </div>
                        ))}
                        {activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === currentDate ? (
                            <AllDayDropPreview preview={activeDropPreview} />
                        ) : null}
                        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                            <AllDayChips
                                tasks={allDay}
                                sourceId={`allday-${currentDate}`}
                                onSelectTask={onSelectTask}
                            />
                            <RoutineStrip tasks={anytime} onSelect={onSelectTask} />
                        </div>
                    </div>
                </AllDayDropLane>
            </div>

            {/* Scrollable time grid */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-20">
                <div className="flex" style={{ height: DAY_GRID_HEIGHT }}>
                    <TimeGutter hourHeight={HOUR_HEIGHT} />
                    <TimedCalendarColumn
                        dateStr={currentDate}
                        tasks={timed}
                        activeDropPreview={activeDropPreview}
                        draftPlacement={draftPlacement}
                        onSelectTask={onSelectTask}
                        onResizeTask={onResizeTask}
                        isToday={isToday}
                        onGridClick={onGridClick}
                    />
                </div>
            </div>
        </div>
        </CalendarHoverContext.Provider>
    );
}
