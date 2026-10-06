import { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";
import { Flag, Plus, CalendarHeart, Focus } from "lucide-react";
import { TimeGutter } from "./TimeGutter";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { AllDayDropLane, AllDayDropPreview, TimeSlotDropLayer, TimedDropPreview } from "./CalendarDropTargets";
import * as Popover from "../primitives/Popover";
import * as ContextMenu from "../primitives/ContextMenu";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT, buildTimedTaskLayouts } from "../../lib/utils/calendar/calendar-utils";
import { useToday } from "../../lib/utils/user-zone";
import { minutesToWallTime } from "../../lib/utils/calendar/calendar-dnd";
import { trackUsageEvent } from "../../lib/api/track-event";
import { CALENDAR_SLOT_MINUTES, type CalendarDropPreview } from "../../lib/utils/calendar/calendar-dnd";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "@cadence/contracts/task";
import type { HolidayRecord } from "@cadence/contracts/proxy";
import type { PersonalEvent } from "../../types/settings";

interface DroppableTimeGridProps {
    dateStr: string;
    timedTasks: Task[];
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
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
    isToday,
    activeDropPreview,
    draftPlacement,
    onGridClick,
}: DroppableTimeGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [contextSlot, setContextSlot] = useState<{ hours: number; mins: number } | null>(null);

    const computeSlotFromEvent = useCallback((e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { hours: 9, mins: 0 };
        const relY = e.clientY - rect.top;
        const slotHeight = (CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT;
        const totalMins = Math.round(relY / slotHeight) * CALENDAR_SLOT_MINUTES;
        return {
            hours: Math.max(0, Math.min(23, Math.floor(totalMins / 60))),
            mins: totalMins % 60,
        };
    }, []);

    const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest("[data-task-chip]")) return;
        const { hours, mins } = computeSlotFromEvent(e);
        onGridClick?.({
            date: dateStr,
            startHour: hours,
            startMinute: mins,
            anchorX: e.clientX,
            anchorY: e.clientY,
        });
    };

    const contextTimeLabel = contextSlot
        ? `${String(contextSlot.hours).padStart(2, "0")}:${String(contextSlot.mins).padStart(2, "0")}`
        : "";

    return (
        <ContextMenu.Root onOpenChange={(open) => { if (open) trackUsageEvent("schedule.context_menu_opened", { object_type: "schedule_cell", input_method: "context_menu" }); else setContextSlot(null); }}>
            <ContextMenu.Trigger asChild>
        <div
            ref={containerRef}
            onClick={handleGridClick}
            onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest("[data-task-chip]")) return;
                setContextSlot(computeSlotFromEvent(e));
            }}
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
                    className="absolute left-1 right-1 z-15 rounded-xl border border-dashed border-accent-primary/30 bg-accent-primary/10 backdrop-blur-sm pointer-events-none flex items-center px-3"
                    style={{
                        top: (draftPlacement.startMinute / 60) * HOUR_HEIGHT,
                        height: ((draftPlacement.endMinute - draftPlacement.startMinute) / 60) * HOUR_HEIGHT,
                    }}
                >
                    <span className="text-[12px] text-accent-primary/70 font-medium">
                        {`${minutesToWallTime(draftPlacement.startMinute)} – ${minutesToWallTime(draftPlacement.endMinute)}`}
                    </span>
                </div>
            )}

            {/* Current time bar */}
            {isToday && <CurrentTimeIndicator />}

        </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                <ContextMenu.Item onSelect={() => {
                    if (!contextSlot) return;
                    onGridClick?.({ date: dateStr, startHour: contextSlot.hours, startMinute: contextSlot.mins, anchorX: 0, anchorY: 0 });
                }}>
                    <Plus size={14} aria-hidden="true" />
                    Add task here {contextTimeLabel && <span className="ml-auto text-[11px] text-twilight-text-muted">{contextTimeLabel}</span>}
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => {
                    if (!contextSlot) return;
                    onGridClick?.({ date: dateStr, startHour: contextSlot.hours, startMinute: contextSlot.mins, anchorX: 0, anchorY: 0 });
                }}>
                    <CalendarHeart size={14} aria-hidden="true" />
                    Add event here
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => {
                    if (!contextSlot) return;
                    onGridClick?.({ date: dateStr, startHour: contextSlot.hours, startMinute: contextSlot.mins, anchorX: 0, anchorY: 0 });
                }}>
                    <Focus size={14} aria-hidden="true" />
                    Block focus time
                </ContextMenu.Item>
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}

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
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
}

/** Chips size to their words and wrap; two rows show, the rest sit behind "+N more". */
function AllDayChips({ tasks, sourceId, onSelectTask, onCompleteTask, onArchiveTask }: {
    tasks: Task[];
    sourceId: string;
    onSelectTask: (taskId: string) => void;
    onCompleteTask?: (taskId: string) => void;
    onArchiveTask?: (taskId: string) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [firstHidden, setFirstHidden] = useState(tasks.length);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const tops: number[] = [];
            let hiddenAt = tasks.length;
            Array.from(el.querySelectorAll<HTMLElement>("[data-lane-chip]")).forEach((chip, index) => {
                if (!tops.includes(chip.offsetTop)) tops.push(chip.offsetTop);
                if (tops.length > 2 && hiddenAt === tasks.length) hiddenAt = index;
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
            onComplete={onCompleteTask}
            onArchive={onArchiveTask}
        />
    );

    return (
        <div className="flex flex-col gap-1">
            <div ref={ref} className="relative flex max-h-[4.4rem] flex-wrap gap-1.5 overflow-hidden">
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
                            className="w-fit text-[11px] text-twilight-text-muted hover:text-accent-primary transition-colors cursor-pointer px-1 py-0.5 rounded-lg hover:bg-white/[0.04]"
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
                                onComplete={onCompleteTask}
                                onArchive={onArchiveTask}
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
    onCompleteTask,
    onArchiveTask,
    onResizeTask,
    onGridClick,
}: DayViewProps) {
    const isToday = currentDate === useToday();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Scroll to 7 AM on mount
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
        }
    }, [currentDate]);

    const { allDay, timed } = useMemo(() => {
        return {
            allDay: tasks.filter((t) => !t.scheduledStart),
            timed: tasks.filter((t) => !!t.scheduledStart),
        };
    }, [tasks]);

    return (
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
                        <AllDayChips
                            tasks={allDay}
                            sourceId={`allday-${currentDate}`}
                            onSelectTask={onSelectTask}
                            onCompleteTask={onCompleteTask}
                            onArchiveTask={onArchiveTask}
                        />
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
                        isToday={isToday}
                        onGridClick={onGridClick}
                    />
                </div>
            </div>
        </div>
    );
}
