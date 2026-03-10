import { useRef, useEffect, useMemo } from "react";
import { TimeGutter } from "./TimeGutter";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { AllDayDropLane, AllDayDropPreview, TimeSlotDropLayer, TimedDropPreview } from "./CalendarDropTargets";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT, taskTop, taskHeight } from "../../lib/utils/calendar-utils";
import { toISODate } from "../../lib/utils/date-format";
import { CALENDAR_SLOT_MINUTES, type CalendarDropPreview } from "../../lib/utils/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "../../types/task";

interface DroppableTimeGridProps {
    dateStr: string;
    timedTasks: Task[];
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    nowTop: number;
    isToday: boolean;
    activeDropPreview?: CalendarDropPreview | null;
    onGridClick?: (info: CalendarEventInfo) => void;
}

function DroppableTimeGrid({
    dateStr,
    timedTasks,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    nowTop,
    isToday,
    activeDropPreview,
    onGridClick,
}: DroppableTimeGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
                relative flex-1 min-w-0
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
            {/* Hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
                <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-white/[0.07]"
                    style={{ top: h * HOUR_HEIGHT }}
                />
            ))}
            {/* Half-hour dashed lines */}
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

            {/* Task blocks */}
            {timedTasks.map((task) => (
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

            {/* Current time bar */}
            {isToday && (
                <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowTop }}
                >
                    <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-lantern shadow-[0_0_8px_var(--color-lantern)] shrink-0" />
                        <div className="flex-1 h-[1.5px] bg-lantern/70 shadow-[0_0_4px_var(--color-lantern)]" />
                    </div>
                </div>
            )}

        </div>
    );
}

export interface DayViewProps {
    /** ISO date string YYYY-MM-DD for the day being shown */
    currentDate: string;
    /** All tasks for this day */
    tasks: Task[];
    activeDropPreview?: CalendarDropPreview | null;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
}

export function DayView({
    currentDate,
    tasks,
    activeDropPreview,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onGridClick,
}: DayViewProps) {
    const today = new Date();
    const todayStr = toISODate(today);
    const isToday = currentDate === todayStr;
    const scrollRef = useRef<HTMLDivElement>(null);

    // Scroll to 7 AM on mount
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
        }
    }, [currentDate]);

    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

    const { allDay, timed } = useMemo(() => {
        return {
            allDay: tasks.filter((t) => t.isAllDay || !t.scheduledStart),
            timed: tasks.filter((t) => !t.isAllDay && !!t.scheduledStart),
        };
    }, [tasks]);

    return (
        <div className="flex flex-col h-full min-h-0">
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
                    <div className={`flex flex-col gap-1 max-w-[480px] ${allDay.length === 0 ? "min-h-11" : ""}`}>
                        {activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === currentDate ? (
                            <AllDayDropPreview preview={activeDropPreview} />
                        ) : null}
                        {allDay.map((t) => (
                            <CalendarTaskChip
                                key={t.id}
                                task={t}
                                variant="pill"
                                sourceId={`allday-${currentDate}`}
                                onSelect={onSelectTask}
                                onComplete={onCompleteTask}
                                onArchive={onArchiveTask}
                            />
                        ))}
                    </div>
                </AllDayDropLane>
            </div>

            {/* Scrollable time grid */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <div className="flex" style={{ height: DAY_GRID_HEIGHT }}>
                    <TimeGutter hourHeight={HOUR_HEIGHT} />
                    <DroppableTimeGrid
                        dateStr={currentDate}
                        timedTasks={timed}
                        activeDropPreview={activeDropPreview}
                        onSelectTask={onSelectTask}
                        onCompleteTask={onCompleteTask}
                        onArchiveTask={onArchiveTask}
                        nowTop={nowTop}
                        isToday={isToday}
                        onGridClick={onGridClick}
                    />
                </div>
            </div>
        </div>
    );
}
