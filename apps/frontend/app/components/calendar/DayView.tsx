import { useRef, useEffect, useMemo } from "react";
import { Flag } from "lucide-react";
import { TimeGutter } from "./TimeGutter";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { AllDayDropLane, AllDayDropPreview, TimeSlotDropLayer, TimedDropPreview } from "./CalendarDropTargets";
import * as Popover from "../primitives/Popover";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT, buildTimedTaskLayouts } from "../../lib/utils/calendar-utils";
import { toISODate } from "../../lib/utils/date-format";
import { CALENDAR_SLOT_MINUTES, type CalendarDropPreview } from "../../lib/utils/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "../../types/task";
import type { HolidayRecord } from "../../lib/holidays/provider";
import type { PersonalEvent } from "../../lib/types/settings";

interface DroppableTimeGridProps {
    dateStr: string;
    timedTasks: Task[];
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    nowTop: number;
    isToday: boolean;
    activeDropPreview?: CalendarDropPreview | null;
    draftPlacement?: { dateStr: string; startMinute: number; endMinute: number } | null;
    onGridClick?: (info: CalendarEventInfo) => void;
}

function DroppableTimeGrid({
    dateStr,
    timedTasks,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onResizeTask,
    nowTop,
    isToday,
    activeDropPreview,
    draftPlacement,
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
                    className="absolute left-0 right-0 border-t border-twilight-border/20"
                    style={{ top: h * HOUR_HEIGHT }}
                />
            ))}
            {/* Quarter-hour dashed lines */}
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

            {/* Task blocks */}
            {buildTimedTaskLayouts(timedTasks).map((layout) => (
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
    holidays?: HolidayRecord[];
    /** Whether this day is the user's birthday */
    isBirthday?: boolean;
    /** Personal events occurring on this day */
    personalEvents?: PersonalEvent[];
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

export function DayView({
    currentDate,
    tasks,
    holidays = [],
    isBirthday = false,
    personalEvents = [],
    activeDropPreview,
    draftPlacement,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onResizeTask,
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
                            <div key={evt.id} className="mb-1 inline-flex max-w-fit items-center gap-2 rounded-full border border-personal/20 bg-personal/12 px-3 py-1 text-xs font-medium text-personal">
                                {evt.emoji ?? "🎉"} {evt.label}
                            </div>
                        ))}
                        {activeDropPreview?.kind === "allday" && activeDropPreview.dateStr === currentDate ? (
                            <AllDayDropPreview preview={activeDropPreview} />
                        ) : null}
                        {allDay.slice(0, 3).map((t) => (
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
                        {allDay.length > 3 && (
                            <Popover.Root>
                                <Popover.Trigger asChild>
                                    <button
                                        type="button"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[11px] text-twilight-text-muted hover:text-lantern transition-colors cursor-pointer px-1 py-0.5 rounded-lg hover:bg-white/[0.04]"
                                    >
                                        +{allDay.length - 3} more
                                    </button>
                                </Popover.Trigger>
                                <Popover.Content side="bottom" align="start" className="w-64 p-2 flex flex-col gap-[3px]">
                                    {allDay.slice(3).map((t) => (
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
                                </Popover.Content>
                            </Popover.Root>
                        )}
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
                        draftPlacement={draftPlacement}
                        onSelectTask={onSelectTask}
                        onCompleteTask={onCompleteTask}
                        onArchiveTask={onArchiveTask}
                        onResizeTask={onResizeTask}
                        nowTop={nowTop}
                        isToday={isToday}
                        onGridClick={onGridClick}
                    />
                </div>
            </div>
        </div>
    );
}
