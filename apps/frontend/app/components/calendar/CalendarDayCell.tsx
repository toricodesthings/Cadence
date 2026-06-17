import { useDroppable } from "@dnd-kit/core";
import * as Popover from "../primitives/Popover";
import { CalendarTaskChip } from "./CalendarTaskChip";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "@cadence/contracts/task";

const MAX_VISIBLE_TASKS = 2;

interface CalendarDayCellProps {
    day: number | null;
    isToday: boolean;
    isSelected: boolean;
    hasTask: boolean;
    /** Has habits scheduled on this day — shows as a small flame-colored dot */
    hasHabit?: boolean;
    /** Has holidays scheduled on this day — shows as a warm ember marker */
    hasHoliday?: boolean;
    /** User's birthday falls on this day — shows a violet birthday marker */
    hasBirthday?: boolean;
    /** Has personal events on this day — shows a warm rose marker */
    hasPersonalEvent?: boolean;
    /** Number of personal events on this day for denser date affordances */
    personalEventCount?: number;
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
    hasHoliday = false,
    hasBirthday = false,
    hasPersonalEvent = false,
    personalEventCount = 0,
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

    if (!day) {
        if (variant === "compact") {
            return <div className="invisible aspect-square w-full max-w-8 rounded-lg" aria-hidden="true" />;
        }
        return <div className="invisible" aria-hidden="true" />;
    }

    const isCompact = variant === "compact";

    // ── Compact variant (sidebar, deadline picker) ──────────────────────────
    if (isCompact) {
        return (
            <button
                onClick={() => onSelect(day)}
                className={`
                    relative aspect-square w-full max-w-8 rounded-lg flex items-center justify-center text-[13px]
                    transition-colors duration-200 cursor-pointer
                    ${isToday
                        ? "bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary font-bold"
                        : "hover:bg-white/[0.06]"}
                    ${isSelected && !isToday
                        ? "bg-white/[0.08] text-twilight-text ring-1 ring-white/10"
                        : !isToday ? "text-twilight-text-muted" : ""}
                `}
            >
                {day}
                {(hasTask || hasHoliday || hasBirthday || hasPersonalEvent) && !isToday && (
                    <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1">
                        {hasTask && <span className="h-1 w-1 rounded-full bg-accent-primary/60" />}
                        {hasHoliday && <span className="h-1.5 w-1.5 rounded-full bg-solstice shadow-[0_0_6px_rgba(217,106,59,0.45)]" />}
                        {hasBirthday && <span className="h-1.5 w-1.5 rounded-full bg-violet shadow-[0_0_6px_rgba(155,114,207,0.45)]" />}
                        {hasPersonalEvent ? (
                            personalEventCount > 1 ? (
                                <span className="inline-flex min-w-4 items-center justify-center rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/15 px-1 text-[9px] font-semibold text-accent-nav-schedule">
                                    {personalEventCount}
                                </span>
                            ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent-nav-schedule shadow-[0_0_6px_color-mix(in_srgb,var(--accent-nav-schedule)_45%,transparent)]" />
                            )
                        ) : null}
                    </span>
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

    const visibleTasks = tasks.slice(0, MAX_VISIBLE_TASKS);
    const hiddenCount = tasks.length - MAX_VISIBLE_TASKS;

    return (
        <div
            ref={setNodeRef}
            onClick={handleCellClick}
            onContextMenu={handleContextMenu}
            className={`
                relative flex flex-col items-start rounded-2xl text-sm
                border transition-[background-color,border-color,box-shadow] duration-200 cursor-pointer overflow-hidden
                ${isOver ? "bg-[color-mix(in_srgb,var(--color-moonlit)_12%,transparent)] border-moonlit/20" : "border-transparent"}
                ${isWeekend && !isToday && !isSelected ? "bg-white/[0.01]" : ""}
                ${isToday
                    ? "bg-accent-primary/10 ring-1 ring-accent-primary/20"
                    : "hover:bg-white/[0.04] hover:glow-lantern"}
                ${isSelected && !isToday
                    ? "bg-white/[0.05] border-white/[0.06]"
                    : ""}
            `}
            style={{ height: 120, minHeight: 120 }}
        >
            {/* Date number — clicking navigates */}
            <button
                type="button"
                onClick={() => onSelect(day)}
                className={`
                    px-2 py-1 w-full text-left flex items-center justify-between cursor-pointer
                    ${isToday ? "text-accent-primary font-semibold" : isSelected ? "text-twilight-text" : "text-twilight-text-soft"}
                `}
            >
                <span className={`
                    font-display text-[13px] font-medium tracking-tight leading-none
                    w-6 h-6 inline-flex items-center justify-center shrink-0
                    ${isToday ? "rounded-full bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_15%,transparent)]" : ""}
                `}>
                    {day}
                </span>
                <span className="flex items-center gap-1.5">
                    {hasHabit && !isToday && (
                        <span
                            title="Habits scheduled"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary/50 shadow-[0_0_4px_color-mix(in_srgb,var(--accent-primary)_40%,transparent)]"
                        />
                    )}
                    {hasHoliday && (
                        <span
                            title="Holiday"
                            className="h-2 w-2 shrink-0 rounded-full bg-solstice shadow-[0_0_8px_rgba(217,106,59,0.45)]"
                        />
                    )}
                    {hasBirthday && (
                        <span
                            title="Birthday"
                            className="h-2 w-2 shrink-0 rounded-full bg-violet shadow-[0_0_8px_rgba(155,114,207,0.45)]"
                        />
                    )}
                    {hasPersonalEvent ? (
                        personalEventCount > 1 ? (
                            <span
                                title={`${personalEventCount} personal events`}
                                className="inline-flex min-w-5 items-center justify-center rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/12 px-1.5 py-0.5 text-[10px] font-semibold text-accent-nav-schedule"
                            >
                                {personalEventCount}
                            </span>
                        ) : (
                            <span
                                title="Personal event"
                                className="h-2 w-2 shrink-0 rounded-full bg-accent-nav-schedule shadow-[0_0_8px_color-mix(in_srgb,var(--accent-nav-schedule)_45%,transparent)]"
                            />
                        )
                    ) : null}
                </span>
            </button>

            {/* Task chips */}
            {tasks.length > 0 && (
                <div className="w-full px-1 pb-1 flex flex-col gap-[2px]">
                    {visibleTasks.map((task) => (
                        <CalendarTaskChip
                            key={task.id}
                            task={task}
                            variant="pill"
                            sourceId={dateStr ? `day-${dateStr}` : undefined}
                            onSelect={onSelectTask ?? (() => { })}
                            onComplete={onCompleteTask}
                            onArchive={onArchiveTask}
                        />
                    ))}

                    {/* +N more popover */}
                    {hiddenCount > 0 && (
                        <Popover.Root>
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[11px] text-twilight-text-muted hover:text-accent-primary transition-colors cursor-pointer px-1 py-0.5 rounded-xl hover:bg-white/[0.04]"
                                >
                                    +{hiddenCount} more
                                </button>
                            </Popover.Trigger>
                            <Popover.Content side="bottom" align="start" className="w-64 p-2 flex flex-col gap-[3px]">
                                {tasks.slice(MAX_VISIBLE_TASKS).map((task) => (
                                    <CalendarTaskChip
                                        key={task.id}
                                        task={task}
                                        variant="pill"
                                        sourceId={dateStr ? `day-${dateStr}` : undefined}
                                        onSelect={onSelectTask ?? (() => { })}
                                        onComplete={onCompleteTask}
                                        onArchive={onArchiveTask}
                                    />
                                ))}
                            </Popover.Content>
                        </Popover.Root>
                    )}
                </div>
            )}
        </div>
    );
}
