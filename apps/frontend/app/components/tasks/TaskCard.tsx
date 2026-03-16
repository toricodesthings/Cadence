import { useState, useRef, useEffect } from "react";
import { GripVertical, Calendar, Pin, Repeat, Bell, BellOff, AlertTriangle, Clock, ChevronRight, ChevronDown, CalendarClock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskContextMenu } from "./TaskContextMenu";
import { EffortDots } from "./EffortDots";
import { useCreateSubtask, useUpdateSubtask, useDeleteSubtask } from "../../hooks/tasks/use-subtasks";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { PRIORITY_CONFIG } from "../../lib/utils/priority";
import { formatShortDate } from "../../lib/utils/date-format";
import { getTaskScheduleSummary, isPassiveTimetableTask } from "../../lib/utils/task-scheduling";
import type { Tag } from "../../types/tag";
import type { Task, Subtask } from "../../types/task";

interface TaskCardProps {
    task: Task;
    tags?: Tag[];
    subtasks?: Subtask[];
    dragProps?: React.HTMLAttributes<HTMLElement>;
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
    isDragging?: boolean;
    isSelected?: boolean;
    isDropTarget?: boolean;
    onSelect?: (id: string) => void;
    variant?: "list" | "board";
}

/** Priority bar CSS var classes — references CSS custom properties set in app.css */
const PRIORITY_BAR_CLASS: Record<number, string> = {
    0: "",
    1: "bg-[var(--color-priority-low)]",
    2: "bg-[var(--color-priority-medium)]",
    3: "bg-[var(--color-priority-high)] priority-high-bar",
    4: "bg-[var(--color-priority-urgent)] priority-urgent-bar",
};

/** Priority background tint (very subtle) */
const PRIORITY_BG_CLASS: Record<number, string> = {
    0: "",
    1: "",
    2: "bg-[var(--color-priority-medium)]/[0.02]",
    3: "bg-[var(--color-priority-high)]/[0.02]",
    4: "bg-[var(--color-priority-urgent)]/[0.03]",
};

/** Inline subtask item — checkbox + title + delete */
function InlineSubtaskItem({
    subtask,
    onToggle,
    onDelete,
}: {
    subtask: Subtask;
    onToggle: (id: string, checked: boolean) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 py-1 group/sub"
        >
            <button
                type="button"
                onClick={() => onToggle(subtask.id, !subtask.isComplete)}
                data-no-dnd="true"
                className={`h-6 w-6 rounded-full border-[1.5px] shrink-0 flex items-center justify-center transition-colors cursor-pointer ${subtask.isComplete
                    ? "bg-lantern/20 border-lantern text-lantern"
                    : "border-twilight-text-muted/70 hover:border-lantern/50"
                    }`}
            >
                {subtask.isComplete && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-lantern">
                        <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
            <span
                className={`flex-1 min-w-0 text-[14px] leading-6 transition-colors ${subtask.isComplete ? "text-twilight-text-muted/40 line-through" : "text-twilight-text-soft"
                    }`}
            >
                {subtask.title}
            </span>
            <button
                type="button"
                onClick={() => onDelete(subtask.id)}
                data-no-dnd="true"
                className="h-7 w-7 rounded-lg opacity-0 group-hover/sub:opacity-100 text-red-400/70 hover:bg-red-500/10 hover:text-red-300 transition-[opacity,color,background-color] cursor-pointer shrink-0"
                aria-label="Delete subtask"
            >
                <span aria-hidden="true">✕</span>
            </button>
        </motion.div>
    );
}

/** Presentational task card — composes TaskCheckbox + TaskContextMenu + inline subtasks */
export function TaskCard({
    task,
    tags = [],
    subtasks = [],
    dragProps,
    dragHandleProps,
    isDragging = false,
    isSelected,
    isDropTarget = false,
    onSelect,
    variant = "list",
}: TaskCardProps) {
    const isComplete = task.state === "COMPLETE";
    const priorityConfig = PRIORITY_CONFIG[task.priority];
    const showUrgentIcon = task.priority >= 3;

    const createSubtask = useCreateSubtask(task.id);
    const updateSubtask = useUpdateSubtask(task.id);
    const deleteSubtask = useDeleteSubtask(task.id);
    const { toggleTask, selectedTaskIds } = useTaskSelectionStore();

    const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(false);
    const [isAddingSubtask, setIsAddingSubtask] = useState(false);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
    const addInputRef = useRef<HTMLInputElement>(null);

    // Override isSelected if managed by global store
    const isGloballySelected = selectedTaskIds.has(task.id);
    const isTaskSelected = isGloballySelected || isSelected;

    // Focus input when adding subtask
    useEffect(() => {
        if (isAddingSubtask && addInputRef.current) {
            addInputRef.current.focus();
        }
    }, [isAddingSubtask]);

    useEffect(() => {
        if (subtasks.length > 0) {
            setIsSubtasksExpanded(true);
        }
    }, [subtasks.length]);

    const handleAddSubtask = () => {
        setIsSubtasksExpanded(true);
        setIsAddingSubtask(true);
    };

    const handleSubmitSubtask = () => {
        const title = newSubtaskTitle.trim();
        if (!title) {
            setIsAddingSubtask(false);
            return;
        }
        const orderIndex = subtasks.length > 0 ? subtasks[subtasks.length - 1].orderIndex + 1 : 0;
        createSubtask.mutate({ title, orderIndex });
        setNewSubtaskTitle("");
        // Keep input focused for rapid entry
    };

    const scheduleSummary = getTaskScheduleSummary(task);
    const scheduleLabel = scheduleSummary.primaryLabel;
    const isPassiveTimetable = isPassiveTimetableTask(task);
    const completedCount = subtasks.filter(s => s.isComplete).length;
    const hasMetaChips = Boolean(
        scheduleLabel ||
        isPassiveTimetable ||
        task.recurrenceRule ||
        task.reminderAt ||
        task.effort ||
        task.notBefore ||
        task.waitingReminder ||
        subtasks.length > 0 ||
        tags.length > 0,
    );
    const isCompactCard = !task.waitingOn && !hasMetaChips && !isSubtasksExpanded && !isAddingSubtask;
    const isBoardCard = variant === "board";

    const handleRename = () => {
        onSelect?.(task.id);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('cadence:focus-task-title', { detail: { taskId: task.id } }));
        }, 150);
    };

    const handleSelect = (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e && "metaKey" in e && (e.metaKey || e.ctrlKey || e.shiftKey)) {
            toggleTask(task.id);
            return;
        }

        onSelect?.(task.id);
    };

    return (
        <article
            data-focus-kind="task"
            data-focus-id={task.id}
            data-task-card={isBoardCard ? "board" : "list"}
            {...dragProps}
            className={`
                group relative flex rounded-[26px] border border-twilight-border/40 transition-[background-color,border-color,box-shadow,opacity,transform,padding] duration-200 cursor-grab active:cursor-grabbing
                ${isBoardCard
                    ? `${isCompactCard ? "items-center gap-2.5 px-3 pr-9 py-3" : "items-start gap-2.5 px-3 pr-9 py-3.5"}`
                    : `${isCompactCard ? "items-center gap-3 px-4 py-3.5 sm:px-5 sm:py-3.5" : "items-start gap-3 px-4 py-4 sm:px-5 sm:py-5"}`
                }
                ${task.state === "WAITING" ? "border-moonlit/25" : ""}
                ${isComplete ? "opacity-45" : ""}
                ${isTaskSelected
                    ? "bg-white/[0.04] ring-1 ring-lantern/15"
                    : `hover:bg-white/[0.035] hover:glow-lantern ${PRIORITY_BG_CLASS[task.priority]}`
                }
                ${isDropTarget ? "ring-1 ring-moonlit/30 border-moonlit/35 bg-moonlit/[0.035]" : ""}
                ${isDragging ? "shadow-[0_18px_46px_rgba(0,0,0,0.32),0_0_24px_rgba(232,164,74,0.08)]" : ""}
            `}
        >
            {/* Priority Bar */}
            {task.priority > 0 && (
                <div
                    className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${PRIORITY_BAR_CLASS[task.priority]}`}
                    aria-hidden="true"
                />
            )}

            {/* Drag handle */}
            <button
                type="button"
                {...dragHandleProps}
                data-no-dnd="true"
                className={`${isBoardCard ? "min-w-6 min-h-8 rounded-xl flex items-center justify-center cursor-pointer" : "btn-icon rounded-2xl"} ${isCompactCard ? "self-center" : "self-start"} transition-opacity text-twilight-text-muted hover:bg-white/[0.04] hover:text-twilight-text ${isBoardCard ? "-ml-1 opacity-0 group-hover:opacity-20 focus-visible:opacity-20" : "-ml-2"} ${isDragging ? "opacity-60" : isBoardCard ? "" : "opacity-0 group-hover:opacity-30 focus-visible:opacity-30"}`}
                aria-label="Drag to reorder"
            >
                <GripVertical size={16} className="text-twilight-text-muted" aria-hidden="true" />
            </button>

            <TaskCheckbox task={task} compact={isBoardCard} />

            {/* Content */}
            <div className={`min-w-0 flex-1 ${isCompactCard ? "flex min-h-[2.75rem] items-center" : ""}`}>
                <button
                    type="button"
                    onClick={(e) => handleSelect(e)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelect(e);
                        }
                    }}
                    aria-label={`Open ${task.title}${task.priority > 0 ? `, ${priorityConfig.label} priority` : ""}`}
                    aria-pressed={isTaskSelected}
                    className={`w-full rounded-2xl text-left ${isBoardCard ? "p-0" : "p-1 -m-1"} ${isCompactCard ? "flex items-center" : ""}`}
                >
                    <div className={`flex gap-2 ${isCompactCard ? "items-center" : "items-start"}`}>
                        {task.isPinned && (
                            <Pin size={12} className={`${isCompactCard ? "" : "mt-1"} rotate-45 text-lantern shrink-0`} aria-label="Pinned" />
                        )}
                        {isPassiveTimetable && (
                            <CalendarClock
                                size={12}
                                className={`${isCompactCard ? "" : "mt-0.5"} shrink-0 text-moonlit`}
                                aria-label="Timetable anchor"
                            />
                        )}
                        {showUrgentIcon && (
                            <AlertTriangle
                                size={13}
                                className={`${isCompactCard ? "" : "mt-0.5"} shrink-0`}
                                style={{ color: task.priority === 4 ? "var(--color-priority-urgent)" : "var(--color-priority-high)" }}
                                aria-hidden="true"
                            />
                        )}
                        <span
                            className={`${isBoardCard ? "text-[15px] leading-[1.4]" : "text-[15px] leading-snug sm:text-base"} ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                        >
                            {task.title}
                        </span>
                    </div>
                </button>

                {task.waitingOn && (
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] italic text-moonlit">
                        <Clock size={12} aria-hidden="true" />
                        <span>Waiting on: {task.waitingOn}</span>
                    </div>
                )}

                {(scheduleLabel || task.recurrenceRule || task.reminderAt || task.effort || task.notBefore || task.waitingReminder || subtasks.length > 0) && (
                    <div className={`${isBoardCard ? "mt-1.5" : "mt-2"} flex flex-wrap items-center gap-2`}>
                        {task.notBefore && (
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-moonlit">
                                Not before {formatShortDate(task.notBefore)}
                            </span>
                        )}
                        {subtasks.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                                data-no-dnd="true"
                                className={`inline-flex items-center gap-2 rounded-2xl px-3 text-[12px] text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text transition-colors cursor-pointer ${isBoardCard ? "min-h-7" : "touch-target min-h-11"}`}
                                aria-label={isSubtasksExpanded ? "Collapse subtasks" : "Expand subtasks"}
                            >
                                {isSubtasksExpanded
                                    ? <ChevronDown size={14} className="shrink-0" />
                                    : <ChevronRight size={14} className="shrink-0" />
                                }
                                <span className="flex h-1.5 w-6 overflow-hidden rounded-full bg-white/[0.04]">
                                    <span
                                        className="h-full bg-feedback-success/60 transition-all duration-300"
                                        style={{ width: `${(completedCount / subtasks.length) * 100}%` }}
                                    />
                                </span>
                                {completedCount}/{subtasks.length}
                            </button>
                        )}
                        {tags.slice(0, 3).map(tag => (
                            <span
                                key={tag.id}
                                className="inline-flex items-center text-[10px] font-medium tracking-wide rounded-md px-1.5 py-0.5 border"
                                style={{
                                    borderColor: tag.color === "default" ? "var(--color-twilight-border)" : `${tag.color}40`,
                                    color: tag.color === "default" ? "var(--color-twilight-text-muted)" : tag.color,
                                    backgroundColor: tag.color === "default" ? "var(--color-twilight-surface-muted)" : `${tag.color}15`,
                                }}
                            >
                                {tag.name}
                            </span>
                        ))}
                        {tags.length > 3 && (
                            <span className="inline-flex items-center text-[10px] font-medium text-twilight-text-soft">
                                +{tags.length - 3}
                            </span>
                        )}
                        {task.effort && (
                            <div className="inline-flex items-center">
                                <EffortDots effort={task.effort} />
                            </div>
                        )}
                        {scheduleLabel && (
                            <span className={`inline-flex items-center gap-1.5 text-[12px] ${
                                isPassiveTimetable
                                    ? "font-medium text-moonlit"
                                    : scheduleSummary.isDeadline || scheduleSummary.isDuration
                                        ? "font-medium text-lantern"
                                        : "text-twilight-text-soft"
                            }`}>
                                <Calendar size={12} aria-hidden="true" />
                                {scheduleLabel}
                            </span>
                        )}
                        {isPassiveTimetable && (
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-moonlit">
                                <CalendarClock size={12} aria-hidden="true" />
                                Timetable anchor
                            </span>
                        )}
                        {task.recurrenceRule && (
                            <span className="inline-flex items-center text-twilight-text-soft" aria-label="Recurring">
                                <Repeat size={12} aria-hidden="true" />
                            </span>
                        )}
                        {task.reminderAt && (
                            <span
                                className={`inline-flex items-center ${task.reminderSilenced ? "text-twilight-text-soft" : "text-twilight-text-soft"}`}
                                aria-label={task.reminderSilenced ? "Reminder silenced" : "Reminder set"}
                            >
                                {task.reminderSilenced
                                    ? <BellOff size={11} aria-hidden="true" />
                                    : <Bell size={11} aria-hidden="true" />
                                }
                            </span>
                        )}
                        {task.waitingReminder && (
                            <span
                                className="inline-flex items-center text-moonlit"
                                title={`Reminder: ${formatShortDate(task.waitingReminder)}`}
                            >
                                <Bell size={11} aria-hidden="true" />
                            </span>
                        )}
                    </div>
                )}

                {/* Inline expandable subtasks */}
                <AnimatePresence>
                    {isSubtasksExpanded && subtasks.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 ml-0.5 space-y-0 border-l border-twilight-border/30 pl-3">
                                <AnimatePresence>
                                    {subtasks.map((sub) => (
                                        <InlineSubtaskItem
                                            key={sub.id}
                                            subtask={sub}
                                            onToggle={(id, checked) => updateSubtask.mutate({ id, isComplete: checked })}
                                            onDelete={(id) => deleteSubtask.mutate(id)}
                                        />
                                    ))}
                                </AnimatePresence>

                                {/* Inline add subtask */}
                                {isAddingSubtask ? (
                                    <div className="flex items-center gap-2 py-1">
                                        <div className="h-6 w-6 rounded-full border-[1.5px] border-twilight-text-muted/70 shrink-0" />
                                        <input
                                            ref={addInputRef}
                                            type="text"
                                            data-no-dnd="true"
                                            value={newSubtaskTitle}
                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSubmitSubtask();
                                                if (e.key === "Escape") { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                            }}
                                            onBlur={() => {
                                                if (newSubtaskTitle.trim()) handleSubmitSubtask();
                                                else { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                            }}
                                            placeholder="Add subtask…"
                                            className="flex-1 min-w-0 bg-transparent text-[14px] leading-6 text-twilight-text-soft outline-none placeholder:text-twilight-text-muted"
                                        />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleAddSubtask}
                                        data-no-dnd="true"
                                    className={`inline-flex items-center gap-2 rounded-2xl px-3 text-[13px] text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text transition-colors cursor-pointer ${isBoardCard ? "min-h-7" : "touch-target min-h-11"}`}
                                >
                                        <span className="text-sm" aria-hidden="true">+</span> Add subtask
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Quick add subtask when none exist yet — shows after context menu triggers it */}
                <AnimatePresence>
                    {isAddingSubtask && subtasks.length === 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 ml-0.5 border-l border-twilight-border/30 pl-3">
                                <div className="flex items-center gap-2 py-1">
                                    <div className="h-6 w-6 rounded-full border-[1.5px] border-twilight-text-muted/70 shrink-0" />
                                    <input
                                        ref={addInputRef}
                                        type="text"
                                        data-no-dnd="true"
                                        value={newSubtaskTitle}
                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSubmitSubtask();
                                            if (e.key === "Escape") { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                        }}
                                        onBlur={() => {
                                            if (newSubtaskTitle.trim()) handleSubmitSubtask();
                                            else { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                        }}
                                        placeholder="Add subtask…"
                                        className="flex-1 min-w-0 bg-transparent text-[14px] leading-6 text-twilight-text-soft outline-none placeholder:text-twilight-text-muted"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Context menu — visible on hover */}
            <div data-no-dnd="true" className={`${isBoardCard ? "absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100" : `opacity-0 group-hover:opacity-100 transition-opacity ${isCompactCard ? "" : "pt-0.5"}`}`}>
                <TaskContextMenu task={task} onAddSubtask={handleAddSubtask} onRename={handleRename} />
            </div>
        </article>
    );
}
