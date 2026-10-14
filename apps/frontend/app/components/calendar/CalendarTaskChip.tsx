import { CalendarItem, RoutineRing, calendarTone, useCalendarItemPresentation } from "./CalendarItem";
import { scheduleKind, type ScheduleKind } from "../../lib/utils/calendar/schedule-day";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskPriority } from "@cadence/contracts/task";
import { TaskCheckbox } from "../tasks/TaskCheckbox";
import { isRecurringTask, isRecurringTaskInstance } from "../../lib/utils/task/task-scheduling";
import { formatChipTime } from "../../lib/utils/date-format";
import { HOUR_HEIGHT } from "../../lib/utils/calendar/calendar-utils";
import { CALENDAR_SLOT_MINUTES } from "../../lib/utils/calendar/calendar-dnd";
import { syncNowSheen, useIsUnderNowLine } from "./CurrentTimeIndicator";

/** The priority is the edge bar and the wash, never the title's colour: accent is for "now". */
const PRIORITY_BAR: Record<TaskPriority, string> = {
    0: "bg-twilight-text-muted/40",
    1: "bg-[var(--color-priority-low)]",
    2: "bg-[var(--color-priority-medium)]",
    3: "bg-[var(--color-priority-high)]",
    4: "bg-[var(--color-priority-urgent)]",
};

const PRIORITY_WASH: Record<TaskPriority, string> = {
    0: "",
    1: "[--chip-wash:color-mix(in_srgb,var(--color-priority-low)_9%,transparent)]",
    2: "[--chip-wash:color-mix(in_srgb,var(--color-priority-medium)_9%,transparent)]",
    3: "[--chip-wash:color-mix(in_srgb,var(--color-priority-high)_10%,transparent)]",
    4: "[--chip-wash:color-mix(in_srgb,var(--color-priority-urgent)_12%,transparent)]",
};

const FIXED_WASH = "[--chip-wash:color-mix(in_srgb,var(--color-moonlit)_6%,transparent)]";

// ── The chip ────────────────────────────────────────────────────────────────

export interface CalendarTaskChipProps {
    task: Task;
    /** "pill" = compact month-view inline chip; "block" = absolute-positioned week/day chip */
    variant: "pill" | "block";
    onSelect: (taskId: string) => void;
    /** Called when user finishes resize-drag on bottom edge. durationMinutes is the new total duration. */
    onResize?: (taskId: string, durationMinutes: number) => void;
    /** AI-suggested task — renders with shimmer border */
    isSuggested?: boolean;
    /** For block variant: inline style with top/height from time calculation */
    style?: CSSProperties;
    /** The source cell id used in DnD drag data */
    sourceId?: string;
    /** Pill leads with its start time (Month cells and grouped routine lists). */
    month?: boolean;
    /** Pill sized to its words (Day's all-day lane) instead of filling its row */
    fit?: boolean;
    /** Which side the hover card opens on */
    tipSide?: "left" | "right";
    /** A routine badge is docked on this block's right edge */
    badge?: boolean;
}

/** The one leading mark: the app's checkbox for a task, the routine's ring, nothing for Fixed (its bar is its mark). */
function LeadMark({ task, kind, compact }: { task: Task; kind: ScheduleKind; compact?: boolean }) {
    if (kind === "fixed") return null;
    return kind === "routine" ? (
        <RoutineRing task={task} size={compact ? 18 : 22} />
    ) : (
        <span className="relative z-10 -my-1 -ml-1 flex shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <TaskCheckbox task={task} compact />
        </span>
    );
}

export function CalendarTaskChip({
    task,
    variant,
    onSelect,
    onResize,
    isSuggested,
    style,
    sourceId,
    month = false,
    fit = false,
    tipSide = "right",
    badge = false,
}: CalendarTaskChipProps) {
    const priority = (task.priority ?? 0) as TaskPriority;
    const kind = scheduleKind(task);
    const isRecurring = isRecurringTask(task) || isRecurringTaskInstance(task);
    const isDone = task.state === "COMPLETE";
    const isUnderNowLine = useIsUnderNowLine(task.scheduledStart, task.scheduledEnd, variant === "block");
    const chipRef = useRef<HTMLDivElement | null>(null);
    const presentation = useCalendarItemPresentation([task]);
    const tone = calendarTone(task);

    const { listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `task-${task.id}`,
        data: { taskId: task.id, sourceId: sourceId ?? null },
        disabled: Boolean(task.isHabit || isRecurring),
    });
    const movable = !task.isHabit && !isRecurring;
    const isNowLive = isUnderNowLine && !isDragging;
    useEffect(() => {
        if (isNowLive) syncNowSheen(chipRef.current);
    }, [isNowLive]);

    const dragStyle: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        ...presentation.style,
        ...style,
        ...(isDragging ? { opacity: 0.35 } : {}),
    };

    const kindClasses =
        kind === "routine"
            ? "border-transparent"
            : kind === "fixed"
              ? `surface-chip border-twilight-border/30 ${FIXED_WASH}`
              : `surface-chip border-twilight-border/30 ${PRIORITY_WASH[priority]}`;
    const kindStyle: CSSProperties | undefined =
        kind === "routine" ? { borderColor: `color-mix(in srgb, ${tone} 30%, transparent)` } : undefined;
    const barClass = kind === "fixed" ? "bg-moonlit/80" : kind === "task" ? PRIORITY_BAR[priority] : "";
    const titleClass = `${kind === "task" ? "text-twilight-text" : "text-twilight-text-soft"} ${isDone ? "line-through decoration-1" : ""}`;
    const timeClass = kind === "fixed" ? "text-moonlit" : "text-twilight-text-muted";
    const open = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(task.id);
    };

    // ── Resize handle state ──
    const [resizeDeltaPx, setResizeDeltaPx] = useState(0);
    const resizeStartY = useRef<number | null>(null);
    const canResize = !!onResize && movable && !isDragging;

    const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resizeStartY.current = e.clientY;
        setResizeDeltaPx(0);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
        if (resizeStartY.current === null) return;
        const delta = e.clientY - resizeStartY.current;
        // Snap to slot increments
        const slotPx = (CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT;
        setResizeDeltaPx(Math.round(delta / slotPx) * slotPx);
    }, []);

    const handleResizePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (resizeStartY.current === null) return;
            const delta = e.clientY - resizeStartY.current;
            const slotPx = (CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT;
            const snappedSlots = Math.round(delta / slotPx);
            resizeStartY.current = null;
            setResizeDeltaPx(0);

            if (snappedSlots !== 0 && onResize && task.scheduledStart && task.scheduledEnd) {
                const startMs = new Date(task.scheduledStart).getTime();
                const endMs = new Date(task.scheduledEnd).getTime();
                const currentDuration = Math.round((endMs - startMs) / 60_000);
                onResize(
                    task.id,
                    Math.max(CALENDAR_SLOT_MINUTES, currentDuration + snappedSlots * CALENDAR_SLOT_MINUTES),
                );
            }
        },
        [onResize, task.id, task.scheduledStart, task.scheduledEnd],
    );

    // ── PILL variant (Month view, All-Day lane) ─────────────────────────────
    if (variant === "pill") {
        return (
            <CalendarItem task={task} onSelect={onSelect} tipSide={tipSide} dragging={isDragging}>
                <motion.div
                    ref={(el) => {
                        setNodeRef(el);
                        chipRef.current = el;
                    }}
                    style={{ ...dragStyle, ...kindStyle }}
                    {...listeners}
                    data-task-chip
                    data-dnd-draggable={movable}
                    className={`
                        group relative ${fit ? "w-fit max-w-full" : "w-full"}
                        rounded-full border px-3 py-1.5 text-[13px] font-medium
                        ${movable ? "cursor-grab" : "cursor-pointer"} select-none ${kind === "routine" ? "" : "bg-transparent"}
                        transition-[background-color,border-color,box-shadow,opacity] duration-150
                        ${kindClasses} ${presentation.className}
                        ${isDragging ? "z-50 shadow-[0_8px_24px_rgba(0,0,0,0.4)]" : ""}
                        ${isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}
                    `}
                    onClick={open}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <LeadMark task={task} kind={kind} compact />
                        <button
                            type="button"
                            onClick={open}
                            className={`flex min-w-0 ${fit ? "" : "flex-1"} cursor-pointer items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 ${titleClass}`}
                        >
                            {month && task.scheduledStart ? (
                                <span className={`shrink-0 tabular-nums ${timeClass}`}>
                                    {formatChipTime(task.scheduledStart)}
                                </span>
                            ) : null}
                            <span className="truncate">{task.title}</span>
                        </button>
                    </div>
                </motion.div>
            </CalendarItem>
        );
    }

    const startLabel = task.scheduledStart ? formatChipTime(task.scheduledStart) : null;
    const rangeLabel = task.scheduledStart ? formatChipTime(task.scheduledStart, task.scheduledEnd) : null;
    const baseHeight = style?.height != null ? parseFloat(String(style.height)) : undefined;
    const renderedHeight = baseHeight != null ? Math.max(18, baseHeight + resizeDeltaPx) : undefined;
    const blockStyle: CSSProperties = {
        ...dragStyle,
        ...kindStyle,
        ...(renderedHeight != null ? { height: `${renderedHeight}px` } : {}),
    };

    return (
        <CalendarItem task={task} onSelect={onSelect} tipSide={tipSide} dragging={isDragging}>
            <motion.div
                ref={(el) => {
                    setNodeRef(el);
                    chipRef.current = el;
                }}
                style={blockStyle}
                {...listeners}
                data-task-chip
                data-dnd-draggable={movable}
                className={`
                    cal-chip group absolute overflow-hidden rounded-xl border
                    ${movable ? "cursor-grab" : "cursor-pointer"} select-none
                    transition-[border-color,box-shadow,opacity] duration-150
                    ${kindClasses} ${presentation.className}
                    ${isDragging ? "z-50 shadow-[0_16px_48px_rgba(0,0,0,0.5)]" : "z-10"}
                    ${isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}
                    ${isNowLive ? "cadence-now-live-chip" : ""}
                `}
                onClick={open}
            >
                <div
                    className={`cal-chip-row absolute inset-0 flex items-center gap-1.5 pl-3 ${badge ? "pr-12" : "pr-1.5"}`}
                >
                    {/* Edge bar: priority for a task, moonlit for Fixed */}
                    {barClass ? (
                        <div className={`absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full ${barClass}`} />
                    ) : null}
                    <span className="cal-chip-lead flex shrink-0">
                        <LeadMark task={task} kind={kind} />
                    </span>
                    <button
                        type="button"
                        onClick={open}
                        aria-label={`Open details for ${task.title}`}
                        className="cal-chip-body flex min-w-0 flex-1 cursor-[inherit] rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/60"
                    >
                        <span className={`cal-chip-title text-[12px] font-medium leading-tight ${titleClass}`}>
                            {task.title}
                        </span>
                        {startLabel ? (
                            <span className={`cal-chip-time-start text-[11px] leading-tight ${timeClass}`}>
                                {startLabel}
                            </span>
                        ) : null}
                        {rangeLabel ? (
                            <span className={`cal-chip-time text-[11px] leading-tight ${timeClass}`}>{rangeLabel}</span>
                        ) : null}
                    </button>
                </div>

                {/* Bottom-edge resize handle */}
                {canResize && (
                    <div
                        className="group/resize absolute z-20 bottom-0 left-2 right-2 flex h-2 cursor-s-resize items-center justify-center"
                        onPointerDown={handleResizePointerDown}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerUp}
                        data-no-dnd="true"
                    >
                        <div className="h-0.5 w-8 rounded-full bg-transparent transition-colors group-hover/resize:bg-twilight-text-muted/30" />
                    </div>
                )}
            </motion.div>
        </CalendarItem>
    );
}

/** A lightweight drag overlay clone shown while dragging */
export function CalendarTaskChipOverlay({ task }: { task: Task }) {
    const priority = (task.priority ?? 0) as TaskPriority;
    const isTimed = !!task.scheduledStart;
    return (
        <div
            className={`
                surface-chip flex items-center gap-2 border border-twilight-border/40 shadow-[0_16px_48px_rgba(0,0,0,0.5)]
                ${isTimed ? "min-w-[16rem] rounded-2xl px-4 py-3 text-[14px] font-semibold" : "rounded-full px-3 py-1.5 text-[13px] font-medium"}
                scale-[1.04] ${PRIORITY_WASH[priority]}
            `}
        >
            <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_BAR[priority]}`} />
            <span className="max-w-[180px] truncate text-twilight-text">{task.title}</span>
        </div>
    );
}
