import { useState, useCallback, useRef, type CSSProperties } from "react";
import { Check, Archive, GripVertical, Repeat, CalendarClock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskPriority } from "../../types/task";
import { formatTime } from "../../lib/utils/date-format";
import { isPassiveTimetableTask, isRecurringTask, isRecurringTaskInstance, supportsManualTaskCompletion } from "../../lib/utils/task-scheduling";
import { HOUR_HEIGHT } from "../../lib/utils/calendar-utils";
import { CALENDAR_SLOT_MINUTES } from "../../lib/utils/calendar-dnd";

/** Tailwind classes for the chip background/border based on priority */
const PRIORITY_PILL_BG: Record<TaskPriority, string> = {
    0: "bg-white/[0.08] border-white/10",
    1: "bg-[color-mix(in_srgb,var(--color-priority-low)_18%,transparent)] border-[color-mix(in_srgb,var(--color-priority-low)_35%,transparent)]",
    2: "bg-[color-mix(in_srgb,var(--color-priority-medium)_18%,transparent)] border-[color-mix(in_srgb,var(--color-priority-medium)_35%,transparent)]",
    3: "bg-[color-mix(in_srgb,var(--color-priority-high)_18%,transparent)] border-[color-mix(in_srgb,var(--color-priority-high)_35%,transparent)]",
    4: "bg-[color-mix(in_srgb,var(--color-priority-urgent)_22%,transparent)] border-[color-mix(in_srgb,var(--color-priority-urgent)_40%,transparent)]",
};

const PRIORITY_TEXT: Record<TaskPriority, string> = {
    0: "text-twilight-text-soft",
    1: "text-[var(--color-priority-low)]",
    2: "text-[var(--color-priority-medium)]",
    3: "text-[var(--color-priority-high)]",
    4: "text-[var(--color-priority-urgent)]",
};

const PRIORITY_LEFT_GLOW: Record<TaskPriority, string> = {
    0: "bg-white/20",
    1: "bg-[var(--color-priority-low)]",
    2: "bg-[var(--color-priority-medium)]",
    3: "bg-[var(--color-priority-high)]",
    4: "bg-[var(--color-priority-urgent)]",
};

export interface CalendarTaskChipProps {
    task: Task;
    /** "pill" = compact month-view inline chip; "block" = absolute-positioned week/day chip */
    variant: "pill" | "block";
    onSelect: (taskId: string) => void;
    onComplete?: (taskId: string) => void;
    onArchive?: (taskId: string) => void;
    /** Called when user finishes resize-drag on bottom edge. durationMinutes is the new total duration. */
    onResize?: (taskId: string, durationMinutes: number) => void;
    /** AI-suggested task — renders with shimmer border */
    isSuggested?: boolean;
    /** For block variant: inline style with top/height from time calculation */
    style?: CSSProperties;
    /** The source cell id used in DnD drag data */
    sourceId?: string;
}

export function CalendarTaskChip({
    task,
    variant,
    onSelect,
    onComplete,
    onArchive,
    onResize,
    isSuggested,
    style,
    sourceId,
}: CalendarTaskChipProps) {
    const [isHovered, setIsHovered] = useState(false);

    const priority = (task.priority ?? 0) as TaskPriority;
    const isRecurring = isRecurringTask(task) || isRecurringTaskInstance(task);
    const isPassiveTimetable = isPassiveTimetableTask(task);
    const allowQuickActions = !task.isHabit && !isRecurring && supportsManualTaskCompletion(task);
    const isCompletedHabit = task.isHabit && task.state === "COMPLETE";

    const { listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `task-${task.id}`,
        data: { taskId: task.id, sourceId: sourceId ?? null },
        disabled: Boolean(task.isHabit || isRecurring),
    });

    const dragStyle: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        ...style,
    };

    // ── PILL variant (Month view, All-Day row) ──────────────────────────────
    if (variant === "pill") {
        return (
            <motion.div
                ref={setNodeRef}
                style={dragStyle}
                {...listeners}
                data-task-chip
                className={`
                    group relative flex items-center gap-2 w-full
                    rounded-full px-3 py-1.5 text-[13px] font-medium
                    border backdrop-blur-md cursor-pointer select-none
                    transition-[background-color,border-color,box-shadow,transform,opacity] duration-150
                    ${isDragging ? "z-50 scale-[1.03] shadow-[0_8px_24px_rgba(0,0,0,0.4)]" : ""}
                    ${isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}
                    ${task.isHabit ? `border-l-2 border-lantern bg-lantern/5 pl-2 shadow-sm ${isCompletedHabit ? "opacity-45" : ""}` : ""}
                    ${isRecurring ? "bg-[rgba(126,184,212,0.08)] border-[rgba(126,184,212,0.18)]" : PRIORITY_PILL_BG[priority]}
                `}
                onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                whileHover={{ scale: 1.01 }}
            >
                {/* Priority dot */}
                <span className={`shrink-0 w-2 h-2 rounded-full ${PRIORITY_LEFT_GLOW[priority]}`} />

                {/* Title */}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
                    className={`flex-1 truncate text-left ${PRIORITY_TEXT[priority]} cursor-pointer flex items-center gap-1`}
                >
                    {task.title}
                    {(task.isHabit || isRecurring) && <Repeat size={10} className={`${task.isHabit ? "text-lantern/50" : "text-moonlit/70"} shrink-0`} />}
                    {isPassiveTimetable && <CalendarClock size={10} className="shrink-0 text-moonlit" />}
                </button>

                {/* Hover quick actions */}
                <AnimatePresence>
                    {isHovered && allowQuickActions && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 shrink-0 bg-twilight-surface/90 backdrop-blur-md rounded-full px-0.5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {onComplete && (
                                <button
                                    type="button"
                                    onClick={() => onComplete(task.id)}
                                    data-no-dnd="true"
                                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                    <Check size={9} className="text-twilight-text-muted" />
                                </button>
                            )}
                            {onArchive && (
                                <button
                                    type="button"
                                    onClick={() => onArchive(task.id)}
                                    data-no-dnd="true"
                                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                    <Archive size={9} className="text-twilight-text-muted" />
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        );
    }

    // ── BLOCK variant (Week/Day view, absolutely positioned) ───────────────
    const timeLabel = task.scheduledStart ? formatTime(task.scheduledStart) : null;
    const endLabel = task.scheduledEnd ? formatTime(task.scheduledEnd) : null;

    // Habit blocks render as slim ribbons: 60% height, reduced opacity, dashed border
    const habitRibbon = task.isHabit;

    // ── Resize handle state ──
    const [resizeDeltaPx, setResizeDeltaPx] = useState(0);
    const resizeStartY = useRef<number | null>(null);
    const canResize = !!onResize && !task.isHabit && !isRecurring && !isDragging;

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
        const snapped = Math.round(delta / slotPx) * slotPx;
        setResizeDeltaPx(snapped);
    }, []);

    const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
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
            const newDuration = Math.max(CALENDAR_SLOT_MINUTES, currentDuration + snappedSlots * CALENDAR_SLOT_MINUTES);
            onResize(task.id, newDuration);
        }
    }, [onResize, task.id, task.scheduledStart, task.scheduledEnd]);

    const baseHeight = style?.height != null ? parseFloat(String(style.height)) : undefined;
    const isCompactBlock = baseHeight != null && baseHeight < 42;
    const blockStyle: CSSProperties = {
        ...dragStyle,
        ...(habitRibbon && baseHeight ? { height: `${baseHeight * 0.6}px` } : {}),
        ...(resizeDeltaPx !== 0 && baseHeight ? { height: `${Math.max(18, baseHeight + resizeDeltaPx)}px` } : {}),
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={blockStyle}
            {...listeners}
            data-task-chip
            className={`
                group absolute flex ${isCompactBlock ? "flex-row items-center" : "flex-col"} gap-0.5
                rounded-xl ${isCompactBlock ? "px-2 py-0.5" : "px-3 py-1.5"} border backdrop-blur-xl cursor-pointer select-none
                transition-[background-color,border-color,box-shadow,transform,opacity] duration-150 overflow-hidden
                shadow-[0_4px_16px_rgba(0,0,0,0.08)]
                ${isRecurring ? "bg-[rgba(126,184,212,0.10)] border-[rgba(126,184,212,0.22)]" : PRIORITY_PILL_BG[priority]}
                ${isDragging ? "z-50 scale-[1.02] shadow-[0_16px_48px_rgba(0,0,0,0.5)]" : "z-10"}
                ${isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}
                ${habitRibbon ? `border-l-2 border-dashed border-lantern/40 bg-lantern/[0.04] ${isCompletedHabit ? "opacity-40" : "opacity-70"} shadow-none` : ""}
            `}
            onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            whileHover={{ zIndex: 20 }}
        >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${PRIORITY_LEFT_GLOW[priority]}`} />

            {/* Hover quick actions */}
            <AnimatePresence>
                {isHovered && allowQuickActions && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute top-1.5 right-1.5 flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical size={11} className="text-twilight-text-muted/90" />
                        {onComplete && (
                            <button
                                type="button"
                                onClick={() => onComplete(task.id)}
                                data-no-dnd="true"
                                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <Check size={10} className="text-twilight-text-muted" />
                            </button>
                        )}
                        {onArchive && (
                            <button
                                type="button"
                                onClick={() => onArchive(task.id)}
                                data-no-dnd="true"
                                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <Archive size={10} className="text-twilight-text-muted" />
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main click target */}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
                className={`text-left pl-2 w-full cursor-pointer ${isCompactBlock ? "flex items-center gap-1.5 overflow-hidden" : "flex flex-col gap-0.5"}`}
            >
                <span className={`${isCompactBlock ? "text-[11px]" : "text-[13px]"} font-medium truncate leading-tight flex flex-wrap items-center gap-1 ${PRIORITY_TEXT[priority]}`}>
                    {task.title}
                    {(task.isHabit || isRecurring) && <Repeat size={10} className={`${task.isHabit ? "text-lantern/50" : "text-moonlit/70"} shrink-0`} />}
                    {isPassiveTimetable && <CalendarClock size={10} className="shrink-0 text-moonlit" />}
                </span>
                {timeLabel && !isCompactBlock && (
                    <span className="text-[12px] text-twilight-text-muted/90 leading-tight">
                        {timeLabel}{endLabel ? ` – ${endLabel}` : ""}
                    </span>
                )}
                {timeLabel && isCompactBlock && (
                    <span className="text-[10px] text-twilight-text-muted/70 shrink-0">
                        {timeLabel}
                    </span>
                )}
            </button>

            {/* Bottom-edge resize handle */}
            {canResize && (
                <div
                    className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize group/resize flex items-center justify-center"
                    onPointerDown={handleResizePointerDown}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerUp}
                    data-no-dnd="true"
                >
                    <div className="w-8 h-0.5 rounded-full bg-white/0 group-hover/resize:bg-white/30 transition-colors" />
                </div>
            )}
        </motion.div>
    );
}

/** A lightweight drag overlay clone shown while dragging */
export function CalendarTaskChipOverlay({ task }: { task: Task }) {
    const priority = (task.priority ?? 0) as TaskPriority;
    const isTimed = !task.isAllDay && !!task.scheduledStart;
    return (
        <div
            className={`
                flex items-center gap-2 border backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.5)]
                ${isTimed ? "min-w-[16rem] rounded-2xl px-4 py-3 text-[14px] font-semibold" : "rounded-full px-3 py-1.5 text-[13px] font-medium"}
                scale-[1.04]
                ${PRIORITY_PILL_BG[priority]}
            `}
        >
            <span className={`shrink-0 w-2 h-2 rounded-full ${PRIORITY_LEFT_GLOW[priority]}`} />
            <span className={`truncate max-w-[180px] ${PRIORITY_TEXT[priority]}`}>{task.title}</span>
        </div>
    );
}
