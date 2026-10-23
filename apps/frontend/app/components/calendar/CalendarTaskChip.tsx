import { CalendarItem, RoutineRing, calendarTone, useCalendarItemPresentation } from "./CalendarItem";
import { scheduleKind, type ScheduleKind } from "../../lib/utils/calendar/schedule-day";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

/** How a chip of this kind looks: its wash and border, edge bar, title and time colours. */
function chipLook(kind: ScheduleKind, priority: TaskPriority, tone: string, isDone: boolean) {
    const routine = kind === "routine";
    const kindClasses = routine
        ? "border-transparent"
        : `surface-chip border-twilight-border/30 ${kind === "fixed" ? FIXED_WASH : PRIORITY_WASH[priority]}`;
    const kindStyle: CSSProperties | undefined = routine ? { borderColor: `color-mix(in srgb, ${tone} 30%, transparent)` } : undefined;
    const barClass = kind === "fixed" ? "bg-moonlit/80" : kind === "task" ? PRIORITY_BAR[priority] : "";
    const titleClass = `${kind === "task" ? "text-twilight-text" : "text-twilight-text-soft"} ${isDone ? "line-through decoration-1" : ""}`;
    const timeClass = kind === "fixed" ? "text-moonlit" : "text-twilight-text-muted";
    return { kindClasses, kindStyle, barClass, titleClass, timeClass };
}

/** Bottom-edge resize: the snapped drag distance while it moves, and the new length on release. */
function useChipResize(task: Task, onResize: CalendarTaskChipProps["onResize"]) {
    const [resizeDeltaPx, setResizeDeltaPx] = useState(0);
    const resizeStartY = useRef<number | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resizeStartY.current = e.clientY;
        setResizeDeltaPx(0);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (resizeStartY.current === null) return;
        setResizeDeltaPx(snappedSlots(e.clientY - resizeStartY.current) * SLOT_PX);
    }, []);

    const onPointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (resizeStartY.current === null) return;
            const slots = snappedSlots(e.clientY - resizeStartY.current);
            resizeStartY.current = null;
            setResizeDeltaPx(0);

            if (slots !== 0 && onResize && task.scheduledStart && task.scheduledEnd) {
                const startMs = new Date(task.scheduledStart).getTime();
                const endMs = new Date(task.scheduledEnd).getTime();
                const currentDuration = Math.round((endMs - startMs) / 60_000);
                onResize(
                    task.id,
                    Math.max(CALENDAR_SLOT_MINUTES, currentDuration + slots * CALENDAR_SLOT_MINUTES),
                );
            }
        },
        [onResize, task.id, task.scheduledStart, task.scheduledEnd],
    );

    return { resizeDeltaPx, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}

const SLOT_PX = (CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT;
/** A resize drag of `deltaPx`, in whole calendar slots. */
const snappedSlots = (deltaPx: number) => Math.round(deltaPx / SLOT_PX);

/** The block's height while a resize drag is under way (never under 18px); unset when the style sets none. */
function resizedHeight(style: CSSProperties | undefined, deltaPx: number): CSSProperties {
    const baseHeight = style?.height != null ? parseFloat(String(style.height)) : undefined;
    return baseHeight != null ? { height: `${Math.max(18, baseHeight + deltaPx)}px` } : {};
}

/** What both chip shapes share: the task, its look, drag wiring and the open action. */
type ChipParts = {
    task: Task;
    kind: ScheduleKind;
    look: ReturnType<typeof chipLook>;
    movable: boolean;
    isDragging: boolean;
    isSuggested?: boolean;
    listeners: ReturnType<typeof useDraggable>["listeners"];
    setRef: (el: HTMLDivElement | null) => void;
    dragStyle: CSSProperties;
    presentationClass: string;
    open: (e: React.MouseEvent) => void;
    onSelect: (taskId: string) => void;
    tipSide: "left" | "right";
};

/** The draggable, clickable surface both chip shapes sit on; `className` adds the shape. */
function ChipShell({ chip, style, className, children }: { chip: ChipParts; style: CSSProperties; className: string; children: ReactNode }) {
    return (
        <CalendarItem task={chip.task} onSelect={chip.onSelect} tipSide={chip.tipSide} dragging={chip.isDragging}>
            <motion.div
                ref={chip.setRef}
                style={style}
                {...chip.listeners}
                data-task-chip
                data-dnd-draggable={chip.movable}
                className={`${className} ${chip.movable ? "cursor-grab" : "cursor-pointer"} select-none ${chip.look.kindClasses} ${chip.presentationClass} ${chip.isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}`}
                onClick={chip.open}
            >
                {children}
            </motion.div>
        </CalendarItem>
    );
}

/** Month cells and the all-day lane: a rounded pill, the time first in Month. */
function PillChip({ chip, fit, month }: { chip: ChipParts; fit: boolean; month: boolean }) {
    const { task, kind, look, isDragging, open } = chip;
    const showTime = month && task.scheduledStart;
    return (
        <ChipShell
            chip={chip}
            style={{ ...chip.dragStyle, ...look.kindStyle }}
            className={`group relative ${fit ? "w-fit max-w-full" : "w-full"} rounded-full border px-3 py-1.5 text-[13px] font-medium ${kind === "routine" ? "" : "bg-transparent"} transition-[background-color,border-color,box-shadow,opacity] duration-150 ${isDragging ? "z-50 shadow-[0_8px_24px_rgba(0,0,0,0.4)]" : ""}`}
        >
            <div className="flex min-w-0 items-center gap-2">
                <LeadMark task={task} kind={kind} compact />
                <button
                    type="button"
                    onClick={open}
                    className={`flex min-w-0 ${fit ? "" : "flex-1"} cursor-pointer items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 ${look.titleClass}`}
                >
                    {showTime ? (
                        <span className={`shrink-0 tabular-nums ${look.timeClass}`}>
                            {formatChipTime(showTime)}
                        </span>
                    ) : null}
                    <span className="truncate">{task.title}</span>
                </button>
            </div>
        </ChipShell>
    );
}

type BlockChipProps = {
    chip: ChipParts;
    style: CSSProperties | undefined;
    badge: boolean;
    isNowLive: boolean;
    resizeDeltaPx: number;
    /** The bottom-edge handle's pointer handlers; null when the block can't be resized. */
    resizeHandlers: ReturnType<typeof useChipResize>["handlers"] | null;
};

/** Week and Day: an absolutely placed block with its times, resizable from the bottom edge. */
function BlockChip({ chip, style, badge, isNowLive, resizeDeltaPx, resizeHandlers }: BlockChipProps) {
    const { task, kind, look, isDragging, open } = chip;
    const start = task.scheduledStart;
    const startLabel = start ? formatChipTime(start) : null;
    const rangeLabel = start ? formatChipTime(start, task.scheduledEnd) : null;
    const blockStyle: CSSProperties = {
        ...chip.dragStyle,
        ...look.kindStyle,
        ...resizedHeight(style, resizeDeltaPx),
    };

    return (
        <ChipShell
            chip={chip}
            style={blockStyle}
            className={`cal-chip group absolute overflow-hidden rounded-xl border transition-[border-color,box-shadow,opacity] duration-150 ${isDragging ? "z-50 shadow-[0_16px_48px_rgba(0,0,0,0.5)]" : "z-10"} ${isNowLive ? "cadence-now-live-chip" : ""}`}
        >
            <div
                className={`cal-chip-row absolute inset-0 flex items-center gap-1.5 pl-3 ${badge ? "pr-12" : "pr-1.5"}`}
            >
                {/* Edge bar: priority for a task, moonlit for Fixed */}
                {look.barClass ? (
                    <div className={`absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full ${look.barClass}`} />
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
                    <span className={`cal-chip-title text-[12px] font-medium leading-tight ${look.titleClass}`}>
                        {task.title}
                    </span>
                    {startLabel ? (
                        <span className={`cal-chip-time-start text-[11px] leading-tight ${look.timeClass}`}>
                            {startLabel}
                        </span>
                    ) : null}
                    {rangeLabel ? (
                        <span className={`cal-chip-time text-[11px] leading-tight ${look.timeClass}`}>{rangeLabel}</span>
                    ) : null}
                </button>
            </div>

            {/* Bottom-edge resize handle */}
            {resizeHandlers && (
                <div
                    className="group/resize absolute z-20 bottom-0 left-2 right-2 flex h-2 cursor-s-resize items-center justify-center"
                    {...resizeHandlers}
                    data-no-dnd="true"
                >
                    <div className="h-0.5 w-8 rounded-full bg-transparent transition-colors group-hover/resize:bg-twilight-text-muted/30" />
                </div>
            )}
        </ChipShell>
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
    const isUnderNowLine = useIsUnderNowLine(task.scheduledStart, task.scheduledEnd, variant === "block");
    const chipRef = useRef<HTMLDivElement | null>(null);
    const presentation = useCalendarItemPresentation([task]);
    const look = chipLook(kind, priority, calendarTone(task), task.state === "COMPLETE");

    const movable = !task.isHabit && !isRecurring;
    const { listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `task-${task.id}`,
        data: { taskId: task.id, sourceId: sourceId ?? null },
        disabled: !movable,
    });
    const isNowLive = isUnderNowLine && !isDragging;
    useEffect(() => {
        if (isNowLive) syncNowSheen(chipRef.current);
    }, [isNowLive]);
    const resize = useChipResize(task, onResize);

    const chip: ChipParts = {
        task,
        kind,
        look,
        movable,
        isDragging,
        isSuggested,
        listeners,
        setRef: (el) => {
            setNodeRef(el);
            chipRef.current = el;
        },
        dragStyle: {
            transform: CSS.Translate.toString(transform),
            ...presentation.style,
            ...style,
            ...(isDragging ? { opacity: 0.35 } : {}),
        },
        presentationClass: presentation.className,
        open: (e) => {
            e.stopPropagation();
            onSelect(task.id);
        },
        onSelect,
        tipSide,
    };

    // ── PILL variant (Month view, All-Day lane) ─────────────────────────────
    if (variant === "pill") return <PillChip chip={chip} fit={fit} month={month} />;
    const canResize = !!onResize && movable && !isDragging;
    return (
        <BlockChip
            chip={chip}
            style={style}
            badge={badge}
            isNowLive={isNowLive}
            resizeDeltaPx={resize.resizeDeltaPx}
            resizeHandlers={canResize ? resize.handlers : null}
        />
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
