import { useState, type CSSProperties } from "react";
import { Check, Archive, GripVertical, Repeat } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskPriority } from "../../types/task";
import { formatTime } from "../../lib/utils/date-format";

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
    isSuggested,
    style,
    sourceId,
}: CalendarTaskChipProps) {
    const [isHovered, setIsHovered] = useState(false);

    const priority = (task.priority ?? 0) as TaskPriority;

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `task-${task.id}`,
        data: { taskId: task.id, sourceId: sourceId ?? null },
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
                {...attributes}
                data-task-chip
                className={`
                    group relative flex items-center gap-2 w-full
                    rounded-full px-3 py-1.5 text-[13px] font-medium
                    border backdrop-blur-md cursor-grab select-none
                    transition-[background-color,border-color,box-shadow,transform,opacity] duration-150
                    ${isDragging ? "z-50 scale-[1.03] shadow-[0_8px_24px_rgba(0,0,0,0.4)]" : ""}
                    ${isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}
                    ${task.isHabit ? "border-l-2 border-lantern bg-lantern/5 pl-2 shadow-sm" : ""}
                `}
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
                    {task.isHabit && <Repeat size={10} className="text-lantern/50 shrink-0" />}
                </button>

                {/* Hover quick actions */}
                <AnimatePresence>
                    {isHovered && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.1 }}
                            className="flex items-center gap-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {onComplete && (
                                <button
                                    type="button"
                                    onClick={() => onComplete(task.id)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                    <Check size={9} className="text-twilight-text-muted" />
                                </button>
                            )}
                            {onArchive && (
                                <button
                                    type="button"
                                    onClick={() => onArchive(task.id)}
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

    return (
        <motion.div
            ref={setNodeRef}
            style={dragStyle}
            {...listeners}
            {...attributes}
            data-task-chip
            className={`
                group absolute left-1 right-1 flex flex-col gap-0.5
                rounded-2xl p-4 border backdrop-blur-xl cursor-grab select-none
                transition-[background-color,border-color,box-shadow,transform,opacity] duration-150 overflow-hidden
                shadow-[0_8px_30px_rgba(0,0,0,0.12)]
                ${PRIORITY_PILL_BG[priority]}
                ${isDragging ? "z-50 scale-[1.02] shadow-[0_16px_48px_rgba(0,0,0,0.5)]" : "z-10"}
                ${isSuggested ? "animate-pulse border-[var(--color-moonlit)]/50" : ""}
                ${task.isHabit ? "border-l-2 border-lantern bg-lantern/5 shadow-sm" : ""}
            `}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            whileHover={{ zIndex: 20 }}
        >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${PRIORITY_LEFT_GLOW[priority]}`} />

            {/* Hover quick actions */}
            <AnimatePresence>
                {isHovered && (
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
                                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <Check size={10} className="text-twilight-text-muted" />
                            </button>
                        )}
                        {onArchive && (
                            <button
                                type="button"
                                onClick={() => onArchive(task.id)}
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
                className="flex flex-col gap-0.5 text-left pl-2 w-full cursor-pointer"
            >
                <span className={`text-[14px] font-medium truncate leading-tight flex flex-wrap items-center gap-1 ${PRIORITY_TEXT[priority]}`}>
                    {task.title}
                    {task.isHabit && <Repeat size={10} className="text-lantern/50 shrink-0" />}
                </span>
                {timeLabel && (
                    <span className="text-[12px] text-twilight-text-muted/90 leading-tight">
                        {timeLabel}{endLabel ? ` – ${endLabel}` : ""}
                    </span>
                )}
            </button>
        </motion.div>
    );
}

/** A lightweight drag overlay clone shown while dragging */
export function CalendarTaskChipOverlay({ task }: { task: Task }) {
    const priority = (task.priority ?? 0) as TaskPriority;
    return (
        <div
            className={`
                flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium
                border backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.5)]
                scale-[1.04]
                ${PRIORITY_PILL_BG[priority]}
            `}
        >
            <span className={`shrink-0 w-2 h-2 rounded-full ${PRIORITY_LEFT_GLOW[priority]}`} />
            <span className={`truncate max-w-[180px] ${PRIORITY_TEXT[priority]}`}>{task.title}</span>
        </div>
    );
}
