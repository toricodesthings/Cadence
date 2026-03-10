import { useRef, useEffect, useMemo } from "react";
import { TimeGutter } from "./TimeGutter";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { AllDayDropLane, AllDayDropPreview, TimeSlotDropLayer, TimedDropPreview } from "./CalendarDropTargets";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT, taskTop, taskHeight } from "../../lib/utils/calendar-utils";
import { toISODate } from "../../lib/utils/date-format";
import { CALENDAR_SLOT_MINUTES, type CalendarDropPreview } from "../../lib/utils/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "../../types/task";

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DroppableDayColumnProps {
    dateStr: string; // "YYYY-MM-DD"
    tasks: Task[];
    isToday: boolean;
    activeDropPreview?: CalendarDropPreview | null;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    onGridClick?: (info: CalendarEventInfo) => void;
}

function DroppableDayColumn({
    dateStr,
    tasks,
    isToday,
    activeDropPreview,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
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
                    className="absolute left-0 right-0 border-t border-white/[0.07]"
                    style={{ top: h * HOUR_HEIGHT }}
                />
            ))}

            {/* Half-hour faint lines */}
            {Array.from({ length: 24 }, (_, h) => (
                <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 border-t border-white/[0.04] border-dashed"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                />
            ))}

            {activeDropPreview?.kind === "timed" && activeDropPreview.dateStr === dateStr ? (
                <TimedDropPreview preview={activeDropPreview} />
            ) : null}

            {/* Task chips — absolutely positioned */}
            {tasks.map((task) => (
                <CalendarTaskChip
                    key={task.id}
                    task={task}
                    variant="block"
                    sourceId={`day-${dateStr}`}
                    onSelect={onSelectTask}
                    onComplete={onCompleteTask}
                    onArchive={onArchiveTask}
                    style={{
                        top: taskTop(task),
                        height: taskHeight(task),
                    }}
                />
            ))}

        </div>
    );
}

export interface WeekViewProps {
    /** The 7 date objects for Mon–Sun of this week */
    weekDates: Date[];
    /** Tasks grouped by ISO date string */
    tasksByDate: Record<string, Task[]>;
    activeDropPreview?: CalendarDropPreview | null;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
}

export function WeekView({
    weekDates,
    tasksByDate,
    activeDropPreview,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onGridClick,
}: WeekViewProps) {
    const today = new Date();
    const todayStr = toISODate(today);
    const scrollRef = useRef<HTMLDivElement>(null);

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

                {weekDates.map((d, i) => {
                    const ds = toISODate(d);
                    const isToday = ds === todayStr;
                    const allDay = allDayByDate[ds] ?? [];

                    return (
                        <div key={ds} className="flex-1 min-w-0 border-l border-twilight-border/20">
                            {/* Day header */}
                            <div className={`px-2 py-3 text-center ${isToday ? "text-lantern" : "text-twilight-text-muted"}`}>
                                <div className="text-[11px] uppercase tracking-widest font-medium text-twilight-text-muted">
                                    {DAYS_SHORT[i]}
                                </div>
                                <div className={`
                                    text-[20px] font-display font-semibold leading-tight mt-0.5
                                    ${isToday
                                        ? "w-9 h-9 mx-auto rounded-full bg-lantern/20 text-lantern ring-1 ring-lantern flex items-center justify-center text-[17px] shadow-[0_0_8px_rgba(232,164,74,0.15)]"
                                        : ""}
                                `}>
                                    {d.getDate()}
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
                                    {allDay.map((t) => (
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
                                    onSelectTask={onSelectTask}
                                    onCompleteTask={onCompleteTask}
                                    onArchiveTask={onArchiveTask}
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
