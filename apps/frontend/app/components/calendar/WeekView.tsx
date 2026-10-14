import { useRef, useEffect, useMemo, useState } from "react";
import { TimeGutter } from "./TimeGutter";
import { CalendarHoverContext } from "./CalendarItem";
import { TimedCalendarColumn } from "./TimedCalendarColumn";
import { AllDayWeekLane } from "./AllDayWeekLane";
import { Tip } from "../primitives";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT } from "../../lib/utils/calendar/calendar-utils";
import { useToday } from "../../lib/utils/user-zone";
import { dayOfMonth, weekdayName } from "../../lib/utils/calendar/calendar-math";
import { type CalendarDropPreview } from "../../lib/utils/calendar/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { LocalDate } from "@cadence/domain/time";
import type { Task } from "@cadence/contracts/task";
import type { HolidayRecord } from "@cadence/contracts/proxy";
import type { PersonalEvent } from "../../types/settings";

export interface WeekViewProps {
    /** The 7 LocalDates of this week in the active configured order */
    weekDates: LocalDate[];
    /** Tasks grouped by LocalDate */
    tasksByDate: Record<string, Task[]>;
    holidaysByDate?: Record<string, HolidayRecord[]>;
    /** ISO date string of user's birthday this year (e.g. "2026-03-15") */
    birthdayDate?: string | null;
    /** Personal events grouped by ISO date string */
    personalEventsByDate?: Record<string, PersonalEvent[]>;
    activeDropPreview?: CalendarDropPreview | null;
    /** Ghost block placement for click-to-create preview */
    draftPlacement?: { dateStr: string; startMinute: number; endMinute: number } | null;
    onSelectTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
    /** Callback to switch to day view for a specific date */
    onJumpToDay?: (dateStr: string) => void;
    /** The hour the timeline opens scrolled to. */
    startHour?: number;
}

export function WeekView({
    weekDates,
    tasksByDate,
    holidaysByDate = {},
    birthdayDate,
    personalEventsByDate = {},
    activeDropPreview,
    draftPlacement,
    onSelectTask,
    onResizeTask,
    onGridClick,
    onJumpToDay,
    startHour = 7,
}: WeekViewProps) {
    const todayStr = useToday();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Open at the user's chosen hour (7 AM by default)
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = startHour * HOUR_HEIGHT;
        }
    }, [startHour]);

    // The series whose hover card is open: its chips light up, the rest dim.
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
    const hover = useMemo(() => ({ series: hoveredSeries, setSeries: setHoveredSeries }), [hoveredSeries]);

    const timedByDate = useMemo(() => {
        const map: Record<string, Task[]> = {};
        weekDates.forEach((ds) => {
            map[ds] = (tasksByDate[ds] ?? []).filter((t) => !!t.scheduledStart);
        });
        return map;
    }, [weekDates, tasksByDate]);

    return (
        <CalendarHoverContext.Provider value={hover}>
        <div className="surface-card m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:m-3">
            {/* ── Day headers ── */}
            <div className="shrink-0 flex">
                <div className="w-14 shrink-0" />
                {weekDates.map((ds) => {
                    const isToday = ds === todayStr;
                    const dayLabel = weekdayName(ds, "short");

                    return (
                        <div
                            key={ds}
                            className={`flex-1 min-w-0 border-l border-twilight-border/20 ${isToday ? "calendar-today-column" : ""}`}
                        >
                            <div className={`px-2 py-3 text-center [@media(max-height:760px)]:py-1.5 ${isToday ? "text-accent-primary" : "text-twilight-text-muted"}`}>
                                <div className="flex flex-col items-center [@media(max-height:760px)]:flex-row [@media(max-height:760px)]:justify-center [@media(max-height:760px)]:gap-1.5">
                                <div className="text-[11px] uppercase tracking-widest font-medium text-twilight-text-muted">
                                    {dayLabel}
                                </div>
                                <div className="mt-0.5 flex items-center justify-center gap-1.5 [@media(max-height:760px)]:mt-0">
                                    <div className={`
                                        font-display font-semibold leading-none
                                        flex h-8 w-8 items-center justify-center text-lg
                                        ${isToday
                                            ? "rounded-full bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary"
                                            : ""}
                                    `}>
                                        {dayOfMonth(ds)}
                                    </div>
                                    {(holidaysByDate[ds]?.length ?? 0) > 0 && (
                                        <Tip label={holidaysByDate[ds].map((holiday) => holiday.name).join(", ")} side="top">
                                            <button
                                                type="button"
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-solstice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solstice/60 cursor-pointer"
                                                aria-label={`Holiday: ${holidaysByDate[ds].map((holiday) => holiday.name).join(", ")}`}
                                            >
                                                <span className="h-2 w-2 rounded-full bg-solstice" />
                                            </button>
                                        </Tip>
                                    )}
                                    {birthdayDate === ds && (
                                        <Tip label="🎂 Your Birthday" side="top">
                                            <button
                                                type="button"
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 cursor-pointer"
                                                aria-label="Your birthday"
                                            >
                                                <span className="h-2 w-2 rounded-full bg-violet" />
                                            </button>
                                        </Tip>
                                    )}
                                    {(personalEventsByDate[ds]?.length ?? 0) > 0 && (
                                        <Tip label={personalEventsByDate[ds].map((e) => `${e.emoji ?? "🎉"} ${e.label}`).join(", ")} side="top">
                                            <button
                                                type="button"
                                                className="inline-flex min-w-4 items-center justify-center rounded-full text-accent-nav-schedule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-nav-schedule/60 cursor-pointer"
                                                aria-label={`Event: ${personalEventsByDate[ds].map((e) => e.label).join(", ")}`}
                                            >
                                                {personalEventsByDate[ds].length > 1 ? (
                                                    <span className="inline-flex min-w-4 items-center justify-center rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/12 px-1 text-[9px] font-semibold text-accent-nav-schedule">
                                                        {personalEventsByDate[ds].length}
                                                    </span>
                                                ) : (
                                                    <span className="h-2 w-2 rounded-full bg-accent-nav-schedule" />
                                                )}
                                            </button>
                                        </Tip>
                                    )}
                                </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── All-day lane: bars across days, one-off tasks, a strip of routine marks ── */}
            <div className="shrink-0 flex border-b border-twilight-border/30">
                <div className="w-14 shrink-0 pr-2.5 pt-1">
                    <span className="block text-right text-[10px] uppercase tracking-widest text-twilight-text-muted/90 select-none">
                        All day
                    </span>
                </div>
                <AllDayWeekLane
                    weekDates={weekDates}
                    tasksByDate={tasksByDate}
                    todayStr={todayStr}
                    activeDropPreview={activeDropPreview}
                    onSelectTask={onSelectTask}
                />
            </div>

            {/* ── Scrollable time grid ── */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-20">
                <div className="flex" style={{ height: DAY_GRID_HEIGHT }}>
                    {/* Time gutter */}
                    <TimeGutter hourHeight={HOUR_HEIGHT} />

                    {/* Day columns */}
                    {weekDates.map((ds, index) => {
                        return (
                            <div key={ds} className="relative flex-1 min-w-0">
                                <TimedCalendarColumn
                                    className="border-l border-twilight-border/25"
                                    dateStr={ds}
                                    tasks={timedByDate[ds] ?? []}
                                    isToday={ds === todayStr}
                                    activeDropPreview={activeDropPreview}
                                    draftPlacement={draftPlacement}
                                    tipSide={index >= 5 ? "left" : "right"}
                                    onSelectTask={onSelectTask}
                                    onResizeTask={onResizeTask}
                                    onGridClick={onGridClick}
                                    onJumpToDay={onJumpToDay}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
        </CalendarHoverContext.Provider>
    );
}
