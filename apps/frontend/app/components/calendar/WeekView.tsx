import { useRef, useEffect, useMemo } from "react";
import { TimeGutter } from "./TimeGutter";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { AllDayDropLane, AllDayDropPreview, TimeSlotDropLayer, TimedDropPreview } from "./CalendarDropTargets";
import * as Popover from "../primitives/Popover";
import * as Tooltip from "../primitives/Tooltip";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT, buildTimedTaskLayouts } from "../../lib/utils/calendar-utils";
import { toISODate } from "../../lib/utils/date-format";
import { CALENDAR_SLOT_MINUTES, type CalendarDropPreview } from "../../lib/utils/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "../../types/task";
import type { HolidayRecord } from "../../lib/holidays/provider";

interface DroppableDayColumnProps {
    dateStr: string; // "YYYY-MM-DD"
    tasks: Task[];
    isToday: boolean;
    activeDropPreview?: CalendarDropPreview | null;
    draftPlacement?: { dateStr: string; startMinute: number; endMinute: number } | null;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    onGridClick?: (info: CalendarEventInfo) => void;
}

function DroppableDayColumn({
    dateStr,
    tasks,
    isToday,
    activeDropPreview,
    draftPlacement,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onResizeTask,
    onGridClick,
}: DroppableDayColumnProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Ignore if clicking directly on a task chip
        if ((e.target as HTMLElement).closest("[data-task-chip]")) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const relY = e.clientY - rect.top;
        const slotHeight = (CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT;
        const totalMins = Math.round(relY / slotHeight) * CALENDAR_SLOT_MINUTES;
        const hours = Math.max(0, Math.min(23, Math.floor(totalMins / 60)));
        const mins = totalMins % 60;

        onGridClick?.({
            date: dateStr,
            startHour: hours,
            startMinute: mins,
            anchorX: e.clientX,
            anchorY: e.clientY,
        });
    };

    return (
        <div
            ref={containerRef}
            onClick={handleGridClick}
            className={`
                relative flex-1 min-w-0 border-l border-white/[0.07]
                transition-colors duration-150 cursor-crosshair
                ${activeDropPreview?.dateStr === dateStr ? "bg-white/[0.015]" : ""}
            `}
            style={{ height: DAY_GRID_HEIGHT }}
        >
            <TimeSlotDropLayer
                dateStr={dateStr}
                activeMinutes={activeDropPreview?.kind === "timed" && activeDropPreview.dateStr === dateStr
                    ? activeDropPreview.startMinutes ?? null
                    : null}
            />
            {/* Hour grid lines */}
            {Array.from({ length: 24 }, (_, h) => (
                <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-twilight-border/20"
                    style={{ top: h * HOUR_HEIGHT }}
                />
            ))}

            {/* Quarter-hour faint lines */}
            {Array.from({ length: 24 * 4 }, (_, slot) => (
                <div
                    key={`quarter-${slot}`}
                    className="absolute left-0 right-0 border-t border-white/[0.03] border-dashed"
                    style={{ top: (slot * HOUR_HEIGHT) / 4 }}
                />
            ))}

            {activeDropPreview?.kind === "timed" && activeDropPreview.dateStr === dateStr ? (
                <TimedDropPreview preview={activeDropPreview} />
            ) : null}

            {/* Task chips — absolutely positioned */}
            {buildTimedTaskLayouts(tasks).map((layout) => (
                <CalendarTaskChip
                    key={layout.task.id}
                    task={layout.task}
                    variant="block"
                    sourceId={`day-${dateStr}`}
                    onSelect={onSelectTask}
                    onComplete={onCompleteTask}
                    onArchive={onArchiveTask}
                    onResize={onResizeTask}
                    style={{
                        top: layout.top,
                        height: layout.height,
                        left: `calc(${(layout.column / layout.columns) * 100}% + 0.25rem)`,
                        width: `calc(${100 / layout.columns}% - 0.5rem)`,
                    }}
                />
            ))}

            {/* Ghost block preview for click-to-create */}
            {draftPlacement && draftPlacement.dateStr === dateStr && (
                <div
                    className="absolute left-1 right-1 z-15 rounded-xl border border-dashed border-lantern/30 bg-lantern/10 backdrop-blur-sm pointer-events-none flex items-center px-3"
                    style={{
                        top: (draftPlacement.startMinute / 60) * HOUR_HEIGHT,
                        height: ((draftPlacement.endMinute - draftPlacement.startMinute) / 60) * HOUR_HEIGHT,
                    }}
                >
                    <span className="text-[12px] text-lantern/70 font-medium">
                        {`${String(Math.floor(draftPlacement.startMinute / 60)).padStart(2, "0")}:${String(draftPlacement.startMinute % 60).padStart(2, "0")} – ${String(Math.floor(draftPlacement.endMinute / 60)).padStart(2, "0")}:${String(draftPlacement.endMinute % 60).padStart(2, "0")}`}
                    </span>
                </div>
            )}

        </div>
    );
}

export interface WeekViewProps {
    /** The 7 date objects for this week in the active configured order */
    weekDates: Date[];
    /** Tasks grouped by ISO date string */
    tasksByDate: Record<string, Task[]>;
    holidaysByDate?: Record<string, HolidayRecord[]>;
    /** ISO date string of user's birthday this year (e.g. "2026-03-15") */
    birthdayDate?: string | null;
    activeDropPreview?: CalendarDropPreview | null;
    /** Ghost block placement for click-to-create preview */
    draftPlacement?: { dateStr: string; startMinute: number; endMinute: number } | null;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
}

export function WeekView({
    weekDates,
    tasksByDate,
    holidaysByDate = {},
    birthdayDate,
    activeDropPreview,
    draftPlacement,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onResizeTask,
    onGridClick,
}: WeekViewProps) {
    const today = new Date();
    const todayStr = toISODate(today);
    const scrollRef = useRef<HTMLDivElement>(null);
    const weekdayFormatter = useMemo(
        () => new Intl.DateTimeFormat("en-US", { weekday: "short" }),
        [],
    );

    // Scroll to 7 AM on mount
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
        }
    }, []);

    // Current time position
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

    // Split tasks into all-day and timed
    const allDayByDate = useMemo(() => {
        const map: Record<string, Task[]> = {};
        weekDates.forEach((d) => {
            const ds = toISODate(d);
            map[ds] = (tasksByDate[ds] ?? []).filter((t) => t.isAllDay || !t.scheduledStart);
        });
        return map;
    }, [weekDates, tasksByDate]);

    const timedByDate = useMemo(() => {
        const map: Record<string, Task[]> = {};
        weekDates.forEach((d) => {
            const ds = toISODate(d);
            map[ds] = (tasksByDate[ds] ?? []).filter((t) => !t.isAllDay && !!t.scheduledStart);
        });
        return map;
    }, [weekDates, tasksByDate]);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* ── Day headers + All-Day row ── */}
            <div className="shrink-0 flex border-b border-twilight-border/30">
                {/* Gutter spacer with "All day" label */}
                <div className="w-14 shrink-0 flex flex-col justify-end pb-2 pr-2.5">
                    <span className="text-[10px] text-twilight-text-muted/90 uppercase tracking-widest text-right select-none">
                        All day
                    </span>
                </div>

                {weekDates.map((d) => {
                    const ds = toISODate(d);
                    const isToday = ds === todayStr;
                    const allDay = allDayByDate[ds] ?? [];
                    const dayLabel = weekdayFormatter.format(d);

                    return (
                        <div key={ds} className="flex-1 min-w-0 border-l border-twilight-border/20">
                            {/* Day header */}
                            <div className={`px-2 py-3 text-center ${isToday ? "text-lantern" : "text-twilight-text-muted"}`}>
                                <div className="text-[11px] uppercase tracking-widest font-medium text-twilight-text-muted">
                                    {dayLabel}
                                </div>
                                <div className="mt-0.5 flex items-center justify-center gap-1.5">
                                    <div className={`
                                        font-display font-semibold leading-none
                                        flex h-8 w-8 items-center justify-center text-lg
                                        ${isToday
                                            ? "rounded-full bg-lantern/20 text-lantern ring-1 ring-lantern shadow-[0_0_8px_rgba(232,164,74,0.15)]"
                                            : ""}
                                    `}>
                                        {d.getDate()}
                                    </div>
                                    {(holidaysByDate[ds]?.length ?? 0) > 0 && (
                                        <Tooltip.Root>
                                            <Tooltip.Trigger asChild>
                                                <button
                                                    type="button"
                                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-solstice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-solstice/60 cursor-pointer"
                                                    aria-label={`Holiday: ${holidaysByDate[ds].map((holiday) => holiday.name).join(", ")}`}
                                                >
                                                    <span className="h-2 w-2 rounded-full bg-solstice shadow-[0_0_8px_rgba(217,106,59,0.45)]" />
                                                </button>
                                            </Tooltip.Trigger>
                                            <Tooltip.Content>
                                                {holidaysByDate[ds].map((holiday) => holiday.name).join(", ")}
                                            </Tooltip.Content>
                                        </Tooltip.Root>
                                    )}
                                    {birthdayDate === ds && (
                                        <Tooltip.Root>
                                            <Tooltip.Trigger asChild>
                                                <button
                                                    type="button"
                                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 cursor-pointer"
                                                    aria-label="Your birthday"
                                                >
                                                    <span className="h-2 w-2 rounded-full bg-violet shadow-[0_0_8px_rgba(155,114,207,0.45)]" />
                                                </button>
                                            </Tooltip.Trigger>
                                            <Tooltip.Content>🎂 Your Birthday</Tooltip.Content>
                                        </Tooltip.Root>
                                    )}
                                </div>
                            </div>

                            {/* All-day chips */}
                            <AllDayDropLane
                                dateStr={ds}
                                className="px-1 pb-1.5"
                                isActive={activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === ds}
                            >
                                <div className="flex flex-col gap-[2px]">
                                    {activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === ds ? (
                                        <AllDayDropPreview preview={activeDropPreview} />
                                    ) : null}
                                    {allDay.slice(0, 1).map((t) => (
                                        <CalendarTaskChip
                                            key={t.id}
                                            task={t}
                                            variant="pill"
                                            sourceId={`allday-${ds}`}
                                            onSelect={onSelectTask}
                                            onComplete={onCompleteTask}
                                            onArchive={onArchiveTask}
                                        />
                                    ))}
                                    {allDay.length > 1 && (
                                        <Popover.Root>
                                            <Popover.Trigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-[10px] leading-none text-twilight-text-muted hover:text-lantern transition-colors cursor-pointer pl-1 py-0.5 rounded-lg hover:bg-white/[0.04]"
                                                >
                                                    +{allDay.length - 1} more
                                                </button>
                                            </Popover.Trigger>
                                            <Popover.Content side="bottom" align="start" className="w-64 p-2 flex flex-col gap-[3px]">
                                                {allDay.slice(1).map((t) => (
                                                    <CalendarTaskChip
                                                        key={t.id}
                                                        task={t}
                                                        variant="pill"
                                                        sourceId={`allday-${ds}`}
                                                        onSelect={onSelectTask}
                                                        onComplete={onCompleteTask}
                                                        onArchive={onArchiveTask}
                                                    />
                                                ))}
                                            </Popover.Content>
                                        </Popover.Root>
                                    )}
                                </div>
                            </AllDayDropLane>
                        </div>
                    );
                })}
            </div>

            {/* ── Scrollable time grid ── */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <div className="flex" style={{ height: DAY_GRID_HEIGHT }}>
                    {/* Time gutter */}
                    <TimeGutter hourHeight={HOUR_HEIGHT} />

                    {/* Day columns */}
                    {weekDates.map((d, i) => {
                        const ds = toISODate(d);
                        return (
                            <div key={ds} className="relative flex-1 min-w-0">
                                <DroppableDayColumn
                                    dateStr={ds}
                                    tasks={timedByDate[ds] ?? []}
                                    isToday={ds === todayStr}
                                    activeDropPreview={activeDropPreview}
                                    draftPlacement={draftPlacement}
                                    onSelectTask={onSelectTask}
                                    onCompleteTask={onCompleteTask}
                                    onArchiveTask={onArchiveTask}
                                    onResizeTask={onResizeTask}
                                    onGridClick={onGridClick}
                                />
                                {/* Current time bar */}
                                {ds === todayStr && (
                                    <div
                                        className="absolute left-0 right-0 z-20 pointer-events-none"
                                        style={{ top: nowTop }}
                                    >
                                        <div className="flex items-center gap-0">
                                            <div className="w-2 h-2 rounded-full bg-lantern shadow-[0_0_6px_var(--color-lantern)] shrink-0" />
                                            <div className="flex-1 h-[1.5px] bg-lantern/70 shadow-[0_0_4px_var(--color-lantern)]" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
