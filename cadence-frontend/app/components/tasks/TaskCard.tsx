import { useState, useRef, useEffect } from "react";
import { GripVertical, Calendar, Pin, Repeat, Bell, BellOff, AlertTriangle, CalendarRange, Clock, ChevronRight, ChevronDown, ListChecks } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskContextMenu } from "./TaskContextMenu";
import { EffortDots } from "./EffortDots";
import { useTaskTags } from "../../hooks/tags/use-task-tags";
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask } from "../../hooks/use-subtasks";
import { useTaskSelection } from "../../stores/task-selection-store";
import { resolveAccentColor } from "../../lib/utils/color-resolver";
import { PRIORITY_CONFIG } from "../../lib/utils/priority";
import type { Task, Subtask } from "../../types/task";

interface TaskCardProps {
    task: Task;
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
    isSelected?: boolean;
    onSelect?: (id: string) => void;
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
                onClick={(e) => { e.stopPropagation(); onToggle(subtask.id, !subtask.isComplete); }}
                className={`w-3.5 h-3.5 rounded-[3px] border shrink-0 flex items-center justify-center transition-colors ${subtask.isComplete
                    ? "bg-feedback-success border-feedback-success text-twilight-base"
                    : "border-twilight-border hover:border-feedback-success/50"
                    }`}
            >
                {subtask.isComplete && (
                    <svg viewBox="0 0 14 14" fill="none" className="w-[8px] h-[8px]">
                        <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
            <span
                className={`flex-1 min-w-0 text-[12px] truncate transition-colors ${subtask.isComplete ? "text-twilight-text-muted/40 line-through" : "text-twilight-text-soft"
                    }`}
            >
                {subtask.title}
            </span>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(subtask.id); }}
                className="opacity-0 group-hover/sub:opacity-100 text-[10px] text-red-400/60 hover:text-red-400 transition-opacity cursor-pointer shrink-0"
                aria-label="Delete subtask"
            >
                ✕
            </button>
        </motion.div>
    );
}

/** Presentational task card — composes TaskCheckbox + TaskContextMenu + inline subtasks */
export function TaskCard({ task, dragHandleProps, isSelected, onSelect }: TaskCardProps) {
    const isComplete = task.state === "COMPLETE";
    const priorityConfig = PRIORITY_CONFIG[task.priority];
    const showUrgentIcon = task.priority >= 3;

    const { data: tags = [] } = useTaskTags(task.id);
    const { data: subtasks = [] } = useSubtasks(task.id);
    const createSubtask = useCreateSubtask(task.id);
    const updateSubtask = useUpdateSubtask(task.id);
    const deleteSubtask = useDeleteSubtask(task.id);
    const { toggleTask, selectedTaskIds } = useTaskSelection();

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

    const scheduledLabel = task.scheduledStart
        ? new Date(task.scheduledStart).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
        })
        : null;

    const dueDateLabel = (() => {
        if (task.scheduledEnd && task.dueDate) {
            const start = new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const end = new Date(task.scheduledEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return `${start} – ${end}`;
        }
        if (task.dueDate) {
            return new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        }
        return null;
    })();

    const hasDuration = !!(task.scheduledEnd && task.dueDate);
    const completedCount = subtasks.filter(s => s.isComplete).length;

    return (
        <div
            className={`
                group relative flex items-start gap-4 rounded-2xl px-5 py-5 border-l-[2px]
                transition-[background-color,border-color,box-shadow,opacity] duration-200 cursor-pointer
                ${task.state === "WAITING" ? "border-moonlit/30" : "border-transparent"}
                ${isComplete ? "opacity-45" : ""}
                ${isTaskSelected
                    ? "bg-white/[0.04] ring-1 ring-lantern/15"
                    : `hover:bg-white/[0.035] hover:glow-lantern ${PRIORITY_BG_CLASS[task.priority]}`
                }
            `}
            onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                    toggleTask(task.id);
                } else {
                    onSelect?.(task.id);
                }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Task: ${task.title}${task.priority > 0 ? `, priority: ${priorityConfig.label}` : ""}. Click to edit.`}
            aria-pressed={isTaskSelected}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(task.id);
                }
            }}
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
                className="opacity-0 group-hover:opacity-30 focus-visible:opacity-30 transition-opacity pt-0.5 -ml-2 cursor-grab"
                aria-label="Drag to reorder"
            >
                <GripVertical size={16} className="text-twilight-text-muted" aria-hidden="true" />
            </button>

            <TaskCheckbox task={task} />

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                    {task.isPinned && (
                        <Pin size={12} className="mt-1 rotate-45 text-lantern shrink-0" aria-label="Pinned" />
                    )}
                    {showUrgentIcon && (
                        <AlertTriangle
                            size={13}
                            className="mt-0.5 shrink-0"
                            style={{ color: task.priority === 4 ? "var(--color-priority-urgent)" : "var(--color-priority-high)" }}
                            aria-hidden="true"
                        />
                    )}
                    <span
                        className={`text-[15px] leading-snug ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                    >
                        {task.title}
                    </span>
                </div>

                {task.waitingOn && (
                    <div className="flex items-center gap-1.5 mt-1 text-[12px] text-moonlit/80 italic">
                        <Clock size={12} aria-hidden="true" />
                        <span>Waiting on: {task.waitingOn}</span>
                    </div>
                )}

                {(scheduledLabel || dueDateLabel || task.recurrenceRule || task.reminderAt || task.effort || task.notBefore || task.waitingReminder || subtasks.length > 0) && (
                    <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                        {task.notBefore && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-moonlit/80">
                                Not before {new Date(task.notBefore).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                        )}
                        {subtasks.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsSubtasksExpanded(!isSubtasksExpanded); }}
                                className="inline-flex items-center gap-1.5 text-[11px] text-twilight-text-muted hover:text-twilight-text-soft transition-colors cursor-pointer"
                                aria-label={isSubtasksExpanded ? "Collapse subtasks" : "Expand subtasks"}
                            >
                                {isSubtasksExpanded
                                    ? <ChevronDown size={11} className="shrink-0" />
                                    : <ChevronRight size={11} className="shrink-0" />
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
                            <span className="inline-flex items-center text-[10px] font-medium text-twilight-text-muted/60">
                                +{tags.length - 3}
                            </span>
                        )}
                        {task.effort && (
                            <div className="inline-flex items-center">
                                <EffortDots effort={task.effort} />
                            </div>
                        )}
                        {scheduledLabel && (
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-twilight-text-muted">
                                <Calendar size={12} aria-hidden="true" />
                                {scheduledLabel}
                            </span>
                        )}
                        {dueDateLabel && (
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-lantern/80 font-medium">
                                {hasDuration
                                    ? <CalendarRange size={12} aria-hidden="true" />
                                    : <Calendar size={12} aria-hidden="true" />
                                }
                                {dueDateLabel}
                            </span>
                        )}
                        {task.recurrenceRule && (
                            <span className="inline-flex items-center text-twilight-text-muted/90" aria-label="Recurring">
                                <Repeat size={12} aria-hidden="true" />
                            </span>
                        )}
                        {task.reminderAt && (
                            <span
                                className={`inline-flex items-center ${task.reminderSilenced ? "text-twilight-text-muted/90" : "text-twilight-text-muted"}`}
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
                                className="inline-flex items-center text-moonlit/80"
                                title={`Reminder: ${new Date(task.waitingReminder).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
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
                            <div className="mt-3 ml-0.5 pl-3 border-l border-twilight-border/30 space-y-0">
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
                                    <div className="flex items-center gap-2 py-1" onClick={(e) => e.stopPropagation()}>
                                        <div className="w-3.5 h-3.5 rounded-[3px] border border-twilight-border/30 shrink-0" />
                                        <input
                                            ref={addInputRef}
                                            type="text"
                                            value={newSubtaskTitle}
                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                e.stopPropagation();
                                                if (e.key === "Enter") handleSubmitSubtask();
                                                if (e.key === "Escape") { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                            }}
                                            onBlur={() => {
                                                if (newSubtaskTitle.trim()) handleSubmitSubtask();
                                                else { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                            }}
                                            placeholder="Add subtask…"
                                            className="flex-1 min-w-0 bg-transparent text-[12px] text-twilight-text-soft outline-none placeholder:text-twilight-text-muted/30"
                                        />
                                    </div>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleAddSubtask(); }}
                                        className="flex items-center gap-2 py-1 text-[11px] text-twilight-text-muted/40 hover:text-twilight-text-muted transition-colors cursor-pointer"
                                    >
                                        <span className="text-[10px]">+</span> Add subtask
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
                            <div className="mt-3 ml-0.5 pl-3 border-l border-twilight-border/30" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2 py-1">
                                    <div className="w-3.5 h-3.5 rounded-[3px] border border-twilight-border/30 shrink-0" />
                                    <input
                                        ref={addInputRef}
                                        type="text"
                                        value={newSubtaskTitle}
                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            if (e.key === "Enter") handleSubmitSubtask();
                                            if (e.key === "Escape") { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                        }}
                                        onBlur={() => {
                                            if (newSubtaskTitle.trim()) handleSubmitSubtask();
                                            else { setIsAddingSubtask(false); setNewSubtaskTitle(""); }
                                        }}
                                        placeholder="Add subtask…"
                                        className="flex-1 min-w-0 bg-transparent text-[12px] text-twilight-text-soft outline-none placeholder:text-twilight-text-muted/30"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Context menu — visible on hover */}
            <div
                className="opacity-0 group-hover:opacity-100 transition-opacity pt-0.5"
                onClick={(e) => e.stopPropagation()}
            >
                <TaskContextMenu task={task} onAddSubtask={handleAddSubtask} />
            </div>
        </div>
    );
}
