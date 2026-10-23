import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, CalendarHeart, Focus, ArrowRight } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { RoutineBadge, RoutineRow } from "./RoutineChips";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";
import { TimeSlotDropLayer, TimedDropPreview } from "./CalendarDropTargets";
import * as ContextMenu from "../primitives/ContextMenu";
import { HOUR_HEIGHT, DAY_GRID_HEIGHT, buildTimedTaskLayouts } from "../../lib/utils/calendar/calendar-utils";
import {
    CALENDAR_SLOT_MINUTES,
    minutesToWallTime,
    type CalendarDropPreview,
} from "../../lib/utils/calendar/calendar-dnd";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { CalendarEventInfo } from "./CalendarEventPopover";

/** What Day and Week pass through to their timed columns. */
export interface TimelineProps {
    activeDropPreview?: CalendarDropPreview | null;
    /** Ghost block placement for click-to-create preview */
    draftPlacement?: { dateStr: string; startMinute: number; endMinute: number } | null;
    onSelectTask: (id: string) => void;
    onResizeTask?: (id: string, durationMinutes: number) => void;
    /** Callback when user clicks an empty grid cell (opens event popover) */
    onGridClick?: (info: CalendarEventInfo) => void;
}

/** The timeline's scroll box, opened at `startHour` (and again whenever `day` changes). */
export function useOpenAtHour(startHour: number, day?: string) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = startHour * HOUR_HEIGHT;
    }, [startHour, day]);
    return ref;
}

/** Day and Week share grid geometry, marker dispatch, drop previews and context creation. */
export function TimedCalendarColumn({
    dateStr,
    tasks,
    isToday,
    activeDropPreview,
    draftPlacement,
    tipSide = "right",
    onSelectTask,
    onResizeTask,
    onGridClick,
    onJumpToDay,
    className = "",
}: TimelineProps & {
    dateStr: string;
    tasks: Task[];
    isToday: boolean;
    tipSide?: "left" | "right";
    onJumpToDay?: (date: string) => void;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [contextMinute, setContextMinute] = useState<number | null>(null);
    const layouts = useMemo(() => buildTimedTaskLayouts(tasks), [tasks]);
    const minuteAt = (e: React.MouseEvent) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return 9 * 60;
        const slot = Math.round((e.clientY - rect.top) / ((CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT));
        return Math.max(0, Math.min(24 * 60 - CALENDAR_SLOT_MINUTES, slot * CALENDAR_SLOT_MINUTES));
    };
    const create = (minute: number, tab: "task" | "event", anchorX = 0, anchorY = 0) =>
        onGridClick?.({
            date: dateStr,
            startHour: Math.floor(minute / 60),
            startMinute: minute % 60,
            tab,
            anchorX,
            anchorY,
        });
    return (
        <ContextMenu.Root
            onOpenChange={(open) => {
                if (open)
                    trackUsageEvent("schedule.context_menu_opened", {
                        object_type: "schedule_cell",
                        input_method: "context_menu",
                    });
                else setContextMinute(null);
            }}
        >
            <ContextMenu.Trigger asChild>
                <div
                    ref={ref}
                    data-calendar-column={dateStr}
                    className={`relative min-w-0 flex-1 cursor-pointer transition-colors duration-150 ${className} ${isToday ? "calendar-today-column" : ""} ${activeDropPreview?.dateStr === dateStr ? "bg-twilight-border/10" : ""}`}
                    style={{ height: DAY_GRID_HEIGHT }}
                    onClick={(e) => {
                        if (!(e.target as HTMLElement).closest("[data-task-chip]"))
                            create(minuteAt(e), "task", e.clientX, e.clientY);
                    }}
                    onContextMenu={(e) => {
                        if (!(e.target as HTMLElement).closest("[data-task-chip]")) setContextMinute(minuteAt(e));
                    }}
                >
                    <TimeSlotDropLayer
                        dateStr={dateStr}
                        activeMinutes={
                            activeDropPreview?.kind === "timed" && activeDropPreview.dateStr === dateStr
                                ? (activeDropPreview.startMinutes ?? null)
                                : null
                        }
                    />
                    {Array.from({ length: 48 }, (_, i) => (
                        <div
                            key={i}
                            aria-hidden="true"
                            className={`absolute inset-x-0 border-t ${i % 2 ? "border-twilight-border/10" : "border-twilight-border/20"}`}
                            style={{ top: (i / 2) * HOUR_HEIGHT }}
                        />
                    ))}
                    {activeDropPreview?.kind === "timed" && activeDropPreview.dateStr === dateStr ? (
                        <TimedDropPreview preview={activeDropPreview} />
                    ) : null}
                    {layouts.map((layout) =>
                        layout.marker === "badge" ? (
                            <RoutineBadge
                                key={layout.task.id}
                                layout={layout}
                                onSelect={onSelectTask}
                                tipSide={tipSide}
                            />
                        ) : layout.marker === "row" ? (
                            <RoutineRow
                                key={layout.task.id}
                                layout={layout}
                                onSelect={onSelectTask}
                                tipSide={tipSide}
                            />
                        ) : (
                            <CalendarTaskChip
                                key={layout.task.id}
                                task={layout.task}
                                variant="block"
                                sourceId={`day-${dateStr}`}
                                onSelect={onSelectTask}
                                onResize={onResizeTask}
                                tipSide={tipSide}
                                badge={layout.badge}
                                style={{
                                    top: layout.top,
                                    height: layout.height,
                                    left: `calc(${(layout.column / layout.columns) * 100}% + 0.25rem)`,
                                    width: `calc(${100 / layout.columns}% - 0.5rem)`,
                                }}
                            />
                        ),
                    )}
                    {draftPlacement?.dateStr === dateStr ? (
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute left-1 right-1 z-15 flex items-center rounded-xl border border-dashed border-accent-primary/30 bg-accent-primary/10 px-3"
                            style={{
                                top: (draftPlacement.startMinute / 60) * HOUR_HEIGHT,
                                height: ((draftPlacement.endMinute - draftPlacement.startMinute) / 60) * HOUR_HEIGHT,
                            }}
                        >
                            <span className="text-[12px] font-medium text-accent-primary/70">
                                {minutesToWallTime(draftPlacement.startMinute)} –{" "}
                                {minutesToWallTime(draftPlacement.endMinute)}
                            </span>
                        </div>
                    ) : null}
                    {isToday ? <CurrentTimeIndicator /> : null}
                </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                {(
                    [
                        ["task", "Add task here", Plus],
                        ["event", "Add event here", CalendarHeart],
                        ["task", "Block focus time", Focus],
                    ] as const
                ).map(([tab, label, Icon]) => (
                    <ContextMenu.Item
                        key={label}
                        onSelect={() => {
                            if (contextMinute !== null) create(contextMinute, tab);
                        }}
                    >
                        <Icon size={14} aria-hidden="true" />
                        {label}
                        {label === "Add task here" && contextMinute !== null ? (
                            <span className="ml-auto text-[11px] text-twilight-text-muted">
                                {minutesToWallTime(contextMinute)}
                            </span>
                        ) : null}
                    </ContextMenu.Item>
                ))}
                {onJumpToDay ? (
                    <>
                        <ContextMenu.Separator />
                        <ContextMenu.Item onSelect={() => onJumpToDay(dateStr)}>
                            <ArrowRight size={14} aria-hidden="true" />
                            Jump to day
                        </ContextMenu.Item>
                    </>
                ) : null}
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
