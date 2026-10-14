import { useLayoutEffect, useRef, useState } from "react";
import type { Task } from "@cadence/contracts/task";
import * as Popover from "../primitives/Popover";
import { RoutineMark } from "../habits/RoutineMark";
import { CalendarTaskChip } from "./CalendarTaskChip";
import {
    CalendarItem,
    RoutineDetailsButton,
    RoutineRing,
    calendarTone,
    useCalendarItemPresentation,
} from "./CalendarItem";
import { formatChipTime } from "../../lib/utils/date-format";
import { MARKER_HEIGHT, type TimedPointLayout } from "../../lib/utils/calendar/calendar-utils";
import type { VirtualHabitTask } from "../../hooks/habits/use-virtual-habit-tasks";

/** One shared list for grouped badges and the strip's visible details/overflow control. */
function RoutineList({ tasks, onSelect }: { tasks: readonly Task[]; onSelect: (id: string) => void }) {
    return (
        <div className="flex flex-col gap-1">
            {tasks.map((task) => (
                <CalendarTaskChip key={task.id} task={task} variant="pill" month onSelect={onSelect} />
            ))}
        </div>
    );
}

/** Points share the row, but every routine keeps its own check-off and named details button. */
export function RoutineRow({
    layout,
    onSelect,
    tipSide,
}: {
    layout: TimedPointLayout;
    onSelect: (id: string) => void;
    tipSide: "left" | "right";
}) {
    const { points } = layout;
    const first = points[0];
    const presentation = useCalendarItemPresentation(points);
    return (
        <div
            data-task-chip
            className={`@container absolute left-1 right-1 z-10 flex items-center gap-1 rounded-xl border px-1 transition-opacity duration-150 ${presentation.className}`}
            style={{
                ...presentation.style,
                top: layout.top,
                height: MARKER_HEIGHT,
                borderColor: `color-mix(in srgb, ${calendarTone(first)} 30%, transparent)`,
            }}
        >
            {points.map((task) => (
                <CalendarItem key={task.id} task={task} onSelect={onSelect} tipSide={tipSide}>
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        <RoutineRing task={task} size={18} />
                        <button
                            type="button"
                            aria-label={`Open details for ${task.title}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(task.id);
                            }}
                            className={`min-w-0 flex-1 cursor-pointer truncate rounded text-left text-[12px] font-medium text-twilight-text-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 ${task.state === "COMPLETE" ? "line-through decoration-1" : ""}`}
                        >
                            {task.title}
                        </button>
                    </div>
                </CalendarItem>
            ))}
            {first.scheduledStart ? (
                <span className="hidden shrink-0 whitespace-nowrap text-[11px] tabular-nums text-twilight-text-muted @[110px]:inline">
                    {formatChipTime(first.scheduledStart)}
                </span>
            ) : null}
        </div>
    );
}

/** The badge never steals a span's column; its mark checks off, its visible details control opens in place. */
export function RoutineBadge({
    layout,
    onSelect,
    tipSide,
}: {
    layout: TimedPointLayout;
    onSelect: (id: string) => void;
    tipSide: "left" | "right";
}) {
    const { points } = layout;
    const first = points[0];
    const presentation = useCalendarItemPresentation(points);
    const style = { ...presentation.style, top: layout.top + (MARKER_HEIGHT - 22) / 2 };
    const placement = `absolute right-1 z-20 rounded-full transition-opacity duration-150 ${presentation.className}`;
    if (points.length === 1)
        return (
            <CalendarItem task={first} onSelect={onSelect} tipSide={tipSide}>
                <div className={`${placement} flex items-center gap-0.5`} style={style} data-task-chip>
                    <RoutineRing task={first} size={22} />
                    <RoutineDetailsButton
                        label={`Open details for ${first.title}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(first.id);
                        }}
                    />
                </div>
            </CalendarItem>
        );
    return (
        <div className={placement} style={style} data-task-chip>
            <Popover.Root>
                <Popover.Trigger asChild>
                    <RoutineDetailsButton
                        label={`${points.length} routines: ${points.map((task) => task.title).join(", ")}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <RoutineMark emoji={(first as VirtualHabitTask).habitEmoji} size={12} />
                        <span className="ml-0.5 tabular-nums">{points.length}</span>
                    </RoutineDetailsButton>
                </Popover.Trigger>
                <Popover.Content side={tipSide} align="start" className="w-64 p-2">
                    <RoutineList tasks={points} onSelect={onSelect} />
                </Popover.Content>
            </Popover.Root>
        </div>
    );
}

const MARK = 24;
const GAP = 4;
const DETAILS = 24;

/** Marks check off; the always-visible details button lists every routine, including overflow. */
export function RoutineStrip({
    tasks,
    onSelect,
    tipSide = "right",
}: {
    tasks: Task[];
    onSelect: (id: string) => void;
    tipSide?: "left" | "right";
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [capacity, setCapacity] = useState(Infinity);
    const hasTasks = tasks.length > 0;
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const measure = () =>
            setCapacity(
                el.clientWidth > 0 ? Math.max(0, Math.floor((el.clientWidth - DETAILS) / (MARK + GAP))) : Infinity,
            );
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasTasks]);
    if (!hasTasks) return null;
    const shown = tasks.slice(0, capacity);
    const hidden = tasks.length - shown.length;
    return (
        <div ref={ref} className="flex min-w-0 max-w-full flex-1 items-center gap-1 py-0.5">
            {shown.map((task) => (
                <RoutineStripMark key={task.id} task={task} onSelect={onSelect} tipSide={tipSide} />
            ))}
            <Popover.Root>
                <Popover.Trigger asChild>
                    <RoutineDetailsButton
                        label={hidden ? `${hidden} more routines · Open routine details` : "Open routine details"}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {hidden ? `+${hidden}` : undefined}
                    </RoutineDetailsButton>
                </Popover.Trigger>
                <Popover.Content side="bottom" align="start" className="w-64 p-2">
                    <RoutineList tasks={tasks} onSelect={onSelect} />
                </Popover.Content>
            </Popover.Root>
        </div>
    );
}

function RoutineStripMark({
    task,
    onSelect,
    tipSide,
}: {
    task: Task;
    onSelect: (id: string) => void;
    tipSide: "left" | "right";
}) {
    const presentation = useCalendarItemPresentation([task]);
    return (
        <CalendarItem task={task} onSelect={onSelect} tipSide={tipSide}>
            <span
                data-task-chip
                className={`inline-flex shrink-0 rounded-full transition-opacity duration-150 ${presentation.className}`}
                style={presentation.style}
            >
                <RoutineRing task={task} />
            </span>
        </CalendarItem>
    );
}
