import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import { CalendarTaskChip } from "./CalendarTaskChip";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "../../types/task";

const MAX_VISIBLE_TASKS = 3;

interface CalendarDayCellProps {
    day: number | null;
    isToday: boolean;
    isSelected: boolean;
    hasTask: boolean;
    /** Has habits scheduled on this day — shows as a small flame-colored dot */
    hasHabit?: boolean;
    onSelect: (day: number) => void;
    /** "compact" = sidebar/picker, "full" = schedule page */
    variant?: "compact" | "full";
    /** Tasks for this cell (full variant only) */
    tasks?: Task[];
    onSelectTask?: (taskId: string) => void;
    onCompleteTask?: (taskId: string) => void;
    onArchiveTask?: (taskId: string) => void;
    /** Parent year/month — needed to build the ISO date for DnD droppable id */
    year?: number;
    month?: number;
    /** Right-click callback for context menu / creating a task */
    onContextAdd?: (info: CalendarEventInfo) => void;
}

/** Single calendar day cell — adapts to compact (sidebar) or full (schedule) layout */
export function CalendarDayCell({
    day,
    isToday,
    isSelected,
    hasTask,
    hasHabit = false,
    onSelect,
    variant = "compact",
    tasks = [],
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    year,
    month,
    onContextAdd,
}: CalendarDayCellProps) {
    const [expanded, setExpanded] = useState(false);

    if (!day) {
        return <div className={variant === "full" ? "invisible" : "invisible"} />;
    }

    const isCompact = variant === "compact";

    // ── Compact variant (sidebar, deadline picker) ──────────────────────────
    if (isCompact) {
        return (
            <button
                onClick={() => onSelect(day)}
                className={`
                    relative w-8 h-8 rounded-lg flex items-center justify-center text-[13px]
                    transition-colors duration-200 cursor-pointer
                    ${isToday
                        ? "bg-lantern/20 text-lantern ring-1 ring-lantern font-bold"
                        : "hover:bg-white/[0.06]"}
                    ${isSelected && !isToday
                        ? "bg-white/[0.08] text-twilight-text ring-1 ring-white/10"
                        : !isToday ? "text-twilight-text-muted" : ""}
                `}
            >
                {day}
                {hasTask && !isToday && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-lantern/60" />
                )}
            </button>
        );
    }

    // ── Full variant (schedule page) ─────────────────────────────────────────
    const dateStr = year !== undefined && month !== undefined
        ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : null;

    // Weekend tint (Saturday = index 6, Sunday = index 0 in JS, but we use Mon-first)
    const dayOfWeek = dateStr ? new Date(dateStr + "T00:00:00").getDay() : -1;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Clicking cell background navigates to day view
    const handleCellClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button, [data-task-chip]")) return;
        onSelect(day);
    };

    // Right-click opens event popover
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!dateStr || !onContextAdd) return;
        onContextAdd({
            date: dateStr,
            startHour: 9,
            startMinute: 0,
            isAllDay: true,
            anchorX: e.clientX,
            anchorY: e.clientY,
        });
    };

    // Droppable for DnD
    const { setNodeRef, isOver } = useDroppable({
        id: dateStr ? `day-${dateStr}` : `day-null-${day}`,
        disabled: !dateStr,
    });

    const visibleTasks = expanded ? tasks : tasks.slice(0, MAX_VISIBLE_TASKS);
    const hiddenCount = tasks.length - MAX_VISIBLE_TASKS;

    return (
        <div
            ref={setNodeRef}
            onClick={handleCellClick}
            onContextMenu={handleContextMenu}
            className={`
                relative flex flex-col items-start rounded-2xl text-sm
                border transition-[background-color,border-color,box-shadow] duration-200 overflow-hidden cursor-pointer
                ${isOver ? "bg-[color-mix(in_srgb,var(--color-moonlit)_12%,transparent)] border-moonlit/20" : "border-transparent"}
                ${isWeekend && !isToday && !isSelected ? "bg-white/[0.01]" : ""}
                ${isToday
                    ? "bg-lantern/10 ring-1 ring-lantern/20"
                    : "hover:bg-white/[0.04] hover:glow-lantern"}
                ${isSelected && !isToday
                    ? "bg-white/[0.05] border-white/[0.06]"
                    : ""}
            `}
        >
            {/* Date number — clicking navigates */}
            <button
                type="button"
                onClick={() => onSelect(day)}
                className={`
                    p-2.5 w-full text-left flex items-center justify-between cursor-pointer
                    ${isToday ? "text-lantern font-semibold" : isSelected ? "text-twilight-text" : "text-twilight-text-soft"}
                `}
            >
                <span className={`
                    font-display text-[15px] font-medium tracking-tight leading-none
                    ${isToday ? "w-7 h-7 flex items-center justify-center rounded-full bg-lantern/20 text-lantern ring-1 ring-lantern text-[13px] shrink-0 shadow-[0_0_8px_rgba(232,164,74,0.15)]" : ""}
                `}>
                    {day}
                </span>
                {/* Habit dot indicator — shows when habits are scheduled on this day */}
                {hasHabit && !isToday && (
                    <span
                        title="Habits scheduled"
                        className="w-1.5 h-1.5 rounded-full bg-lantern/50 shrink-0 shadow-[0_0_4px_rgba(232,164,74,0.4)]"
                    />
                )}
            </button>

            {/* Task chips */}
            {tasks.length > 0 && (
                <div className="w-full px-1.5 pb-1.5 flex flex-col gap-[3px]">
                    <AnimatePresence initial={false}>
                        {visibleTasks.map((task) => (
                            <motion.div
                                key={task.id}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <CalendarTaskChip
                                    task={task}
                                    variant="pill"
                                    sourceId={dateStr ? `day-${dateStr}` : undefined}
                                    onSelect={onSelectTask ?? (() => { })}
                                    onComplete={onCompleteTask}
                                    onArchive={onArchiveTask}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* +N more toggle — expands cell downward */}
                    {hiddenCount > 0 && !expanded && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                            className="text-[11px] text-twilight-text-muted hover:text-lantern transition-colors cursor-pointer px-1 py-0.5 rounded-xl hover:bg-white/[0.04]"
                        >
                            +{hiddenCount} more
                        </button>
                    )}
                    {expanded && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                            className="text-[11px] text-twilight-text-muted hover:text-lantern transition-colors cursor-pointer px-1 py-0.5 rounded-xl hover:bg-white/[0.04]"
                        >
                            Show less
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

