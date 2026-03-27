import { useState, useRef, useEffect } from "react";
import {
    Calendar,
    Pin,
    Repeat,
    Bell,
    BellOff,
    AlertTriangle,
    Clock,
    ChevronRight,
    ChevronDown,
    CalendarClock,
    Tag as TagIcon,
    ArrowUp,
    ArrowDown,
    Sparkles,
    GripVertical,
    type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskContextMenu } from "./TaskContextMenu";
import { RenameTaskDialog } from "./RenameTaskDialog";
import { useCreateSubtask, useUpdateSubtask, useDeleteSubtask, useReorderSubtasks } from "../../hooks/tasks/use-subtasks";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import { formatShortDate } from "../../lib/utils/date-format";
import { getTaskScheduleSummary, isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import type { Tag } from "../../types/tag";
import type { Task, Subtask } from "../../types/task";

interface TaskCardProps {
    task: Task;
    tags?: Tag[];
    subtasks?: Subtask[];
    isDragging?: boolean;
    isSelected?: boolean;
    isDropTarget?: boolean;
    onSelect?: (id: string) => void;
    variant?: "list" | "board";
    /** Simplify context menu and reduce metadata for Holding route */
    holdingContext?: boolean;
    /** Optional smart-sort rationale label */
    rationaleLabel?: string | null;
    /** dnd-kit drag handle props — scopes drag to an explicit grip handle */
    dragHandleProps?: {
        ref: (node: HTMLElement | null) => void;
        listeners: Record<string, Function> | undefined;
        attributes: Record<string, any>;
    };
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

const PASSIVE_TIMETABLE_CARD_CLASS =
    "border-moonlit/22 bg-[linear-gradient(180deg,rgba(126,184,212,0.08),rgba(126,184,212,0.03))] shadow-[inset_0_1px_0_rgba(126,184,212,0.08)]";

const EFFORT_LABELS: Record<1 | 2 | 3, string> = {
    1: "Light effort",
    2: "Medium effort",
    3: "Deep effort",
};

type CollapsedSignal = {
    key: string;
    icon: LucideIcon;
    label: string;
    className: string;
    button?: boolean;
    style?: React.CSSProperties;
    accentDots?: string[];
};

function getTagTone(tag?: Tag) {
    if (!tag || tag.color === "default") {
        return {
            backgroundColor: "rgba(255,255,255,0.04)",
            borderColor: "rgba(255,255,255,0.08)",
            color: "var(--color-twilight-text-soft)",
            accentColor: "rgba(201,209,223,0.8)",
        };
    }

    return {
        backgroundColor: `${tag.color}16`,
        borderColor: `${tag.color}33`,
        color: tag.color,
        accentColor: tag.color,
    };
}

/** Inline subtask item — checkbox + title + delete */
function InlineSubtaskItem({
    subtask,
    onToggle,
    onDelete,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
    compact,
}: {
    subtask: Subtask;
    onToggle: (id: string, checked: boolean) => void;
    onDelete: (id: string) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    compact: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="group/sub flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-white/[0.03]"
        >
            <button
                type="button"
                onClick={() => onToggle(subtask.id, !subtask.isComplete)}
                data-no-dnd="true"
                className={`h-6 w-6 rounded-full border-[1.5px] shrink-0 flex items-center justify-center transition-colors cursor-pointer ${subtask.isComplete
                    ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                    : "border-twilight-text-muted/70 hover:border-accent-primary/50"
                    }`}
            >
                {subtask.isComplete && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-accent-primary">
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
            <div className={`flex items-center gap-1 ${compact ? "opacity-100" : "opacity-0 group-hover/sub:opacity-100 touch-reveal"} transition-opacity`}>
                <button
                    type="button"
                    onClick={() => onMoveUp(subtask.id)}
                    data-no-dnd="true"
                    disabled={!canMoveUp}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text disabled:pointer-events-none disabled:opacity-25"
                    aria-label="Move subtask up"
                >
                    <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={() => onMoveDown(subtask.id)}
                    data-no-dnd="true"
                    disabled={!canMoveDown}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text disabled:pointer-events-none disabled:opacity-25"
                    aria-label="Move subtask down"
                >
                    <ArrowDown size={14} aria-hidden="true" />
                </button>
            </div>
            <button
                type="button"
                onClick={() => onDelete(subtask.id)}
                data-no-dnd="true"
                className={`h-8 w-8 shrink-0 rounded-xl text-red-400/70 transition-[opacity,color,background-color] hover:bg-red-500/10 hover:text-red-300 ${
                    compact ? "opacity-100" : "opacity-0 group-hover/sub:opacity-100 touch-reveal"
                }`}
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
    isDragging = false,
    isSelected,
    isDropTarget = false,
    onSelect,
    variant = "list",
    holdingContext,
    rationaleLabel,
    dragHandleProps,
}: TaskCardProps) {
    const isComplete = task.state === "COMPLETE";
    const priorityConfig = PRIORITY_CONFIG[task.priority];
    const showUrgentIcon = task.priority >= 3;

    const createSubtask = useCreateSubtask(task.id);
    const updateSubtask = useUpdateSubtask(task.id);
    const deleteSubtask = useDeleteSubtask(task.id);
    const reorderSubtask = useReorderSubtasks(task.id);
    const { toggleTask, selectedTaskIds } = useTaskSelectionStore();
    const shell = useShellMode();

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
        const orderIndex = orderedSubtasks.length > 0 ? orderedSubtasks[orderedSubtasks.length - 1].orderIndex + 1 : 0;
        createSubtask.mutate({ title, orderIndex });
        setNewSubtaskTitle("");
        // Keep input focused for rapid entry
    };

    const scheduleSummary = getTaskScheduleSummary(task);
    const scheduleLabel = scheduleSummary.primaryLabel;
    const isPassiveTimetable = isPassiveTimetableTask(task);
    const orderedSubtasks = [...subtasks].sort((a, b) => a.orderIndex - b.orderIndex);
    const completedCount = orderedSubtasks.filter((subtask) => subtask.isComplete).length;
    const tagSummary = tags.length === 1 ? tags[0]?.name ?? "1 tag" : `${tags.length} tags`;
    const primaryTagTone = getTagTone(tags[0]);
    const tagAccentDots = tags
        .slice(0, 2)
        .map((tag) => getTagTone(tag).accentColor);
    const subtaskSummary = `${completedCount}/${orderedSubtasks.length} subtasks`;
    const primaryCue = scheduleLabel
        ? {
            icon: isPassiveTimetable ? CalendarClock : Calendar,
            label: scheduleLabel,
            className: isPassiveTimetable
                ? "text-moonlit"
                : scheduleSummary.isDeadline || scheduleSummary.isDuration
                    ? "text-accent-primary"
                    : "text-twilight-text-soft",
        }
        : task.waitingOn
            ? {
                icon: Clock,
                label: `Waiting on ${task.waitingOn}`,
                className: "text-moonlit",
            }
            : task.recurrenceRule
                ? {
                    icon: Repeat,
                    label: "Repeating task",
                    className: "text-twilight-text-soft",
                }
                : null;

    const secondarySignalCandidates: Array<CollapsedSignal | null> = [
        !scheduleLabel && task.notBefore
            ? {
                key: "not-before",
                icon: Calendar,
                label: `Not before ${formatShortDate(task.notBefore)}`,
                className: "text-moonlit",
            }
            : null,
        scheduleLabel && task.waitingOn
            ? {
                key: "waiting",
                icon: Clock,
                label: `Waiting on ${task.waitingOn}`,
                className: "text-moonlit",
            }
            : null,
        orderedSubtasks.length > 0
            ? {
                key: "subtasks",
                icon: ChevronRight,
                label: subtaskSummary,
                className: "text-twilight-text-soft",
                button: true,
            }
            : null,
        tags.length > 0
            ? {
                key: "tags",
                icon: TagIcon,
                label: tagSummary,
                className: "",
                style: {
                    backgroundColor: primaryTagTone.backgroundColor,
                    borderColor: primaryTagTone.borderColor,
                    color: primaryTagTone.color,
                },
                accentDots: tagAccentDots,
            }
            : null,
        task.effort
            ? {
                key: "effort",
                icon: Clock,
                label: EFFORT_LABELS[task.effort],
                className: "text-twilight-text-soft",
            }
            : null,
        task.waitingReminder
            ? {
                key: "waiting-reminder",
                icon: Bell,
                label: `Waiting reminder ${formatShortDate(task.waitingReminder)}`,
                className: "text-moonlit",
            }
            : null,
        task.reminderAt
            ? {
                key: "reminder",
                icon: task.reminderSilenced ? BellOff : Bell,
                label: task.reminderSilenced ? "Reminder silenced" : "Reminder set",
                className: "text-twilight-text-soft",
            }
            : null,
        task.recurrenceRule && primaryCue?.label !== "Repeating task"
            ? {
                key: "recurrence",
                icon: Repeat,
                label: "Repeats",
                className: "text-twilight-text-soft",
            }
            : null,
    ];

    const secondarySignals = secondarySignalCandidates.filter((signal): signal is CollapsedSignal => signal !== null);

    const visibleSignals = secondarySignals.slice(0, shell.isPhone ? 2 : 3);
    const hasCollapsedSupport = Boolean(primaryCue || visibleSignals.length > 0);
    const isCompactCard = !hasCollapsedSupport && !isSubtasksExpanded && !isAddingSubtask;
    const isBoardCard = variant === "board";

    const [isRenaming, setIsRenaming] = useState(false);

    const handleRename = () => {
        setIsRenaming(true);
    };

    const handleSelect = (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e && "metaKey" in e && (e.metaKey || e.ctrlKey || e.shiftKey)) {
            toggleTask(task.id);
            return;
        }

        onSelect?.(task.id);
    };

    const handleMoveSubtask = (subtaskId: string, direction: -1 | 1) => {
        const currentIndex = orderedSubtasks.findIndex((subtask) => subtask.id === subtaskId);
        const targetIndex = currentIndex + direction;

        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedSubtasks.length) {
            return;
        }

        const currentSubtask = orderedSubtasks[currentIndex];
        const reordered = [...orderedSubtasks];
        const [movedSubtask] = reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, movedSubtask);

        let prevIndex: number | null = null;
        let nextIndex: number | null = null;

        if (targetIndex > 0) prevIndex = reordered[targetIndex - 1].orderIndex;
        if (targetIndex < reordered.length - 1) nextIndex = reordered[targetIndex + 1].orderIndex;

        const newOrderIndex =
            prevIndex === null && nextIndex === null
                ? 0
                : prevIndex === null
                    ? nextIndex! - 1
                    : nextIndex === null
                        ? prevIndex + 1
                        : (prevIndex + nextIndex) / 2;

        const optimisticSubtasks = reordered
            .map((subtask) => (subtask.id === currentSubtask.id ? { ...subtask, orderIndex: newOrderIndex } : subtask))
            .sort((a, b) => a.orderIndex - b.orderIndex);

        reorderSubtask.mutate({
            id: currentSubtask.id,
            newOrderIndex,
            optimisticSubtasks,
        });
    };

    const shouldIgnoreCardOpen = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return false;
        return Boolean(
            target.closest(
                '[data-no-open="true"], [data-no-dnd="true"], button, input, textarea, select, a, [role="menu"], [role="menuitem"]',
            ),
        );
    };

    return (
        <article
            data-focus-kind="task"
            data-focus-id={task.id}
            data-task-card={isBoardCard ? "board" : "list"}
            onClick={(e) => {
                if (shouldIgnoreCardOpen(e.target)) return;
                handleSelect(e);
            }}
            className={`
                group relative flex cursor-pointer rounded-[26px] ring-1 ring-white/[0.06] transition-[background-color,border-color,box-shadow,opacity,transform,padding] duration-200
                ${isBoardCard
                    ? `${isCompactCard ? "items-center gap-2 px-3.5 py-3" : "items-start gap-2 px-3.5 py-3.5"}`
                    : `${isCompactCard ? "items-center gap-2.5 px-4 py-3.5 sm:px-5 sm:py-3.5" : "items-start gap-2.5 px-4 py-4 sm:px-5 sm:py-5"}`
                }
                ${task.state === "WAITING" ? "border-moonlit/25" : ""}
                ${isPassiveTimetable ? PASSIVE_TIMETABLE_CARD_CLASS : ""}
                ${isComplete ? "opacity-45" : ""}
                ${isTaskSelected
                    ? "bg-white/[0.04] ring-1 ring-accent-primary/15"
                    : `hover:bg-white/[0.035] hover:glow-lantern ${PRIORITY_BG_CLASS[task.priority]}`
                }
                ${isDropTarget ? "ring-1 ring-moonlit/30 border-moonlit/35 bg-moonlit/[0.035]" : ""}
                ${isDragging ? "shadow-[0_18px_46px_rgba(0,0,0,0.32),0_0_24px_color-mix(in_srgb,var(--accent-primary)_8%,transparent)]" : ""}
            `}
        >
            {/* Priority Bar */}
            {(isPassiveTimetable || task.priority > 0) && (
                <div
                    className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${isPassiveTimetable ? "bg-moonlit/90" : PRIORITY_BAR_CLASS[task.priority]}`}
                    aria-hidden="true"
                />
            )}

            {/* Drag handle — scoped drag target so card body stays free for selection & context menu */}
            {dragHandleProps && (
                <div
                    ref={dragHandleProps.ref}
                    role={dragHandleProps.attributes?.role}
                    tabIndex={dragHandleProps.attributes?.tabIndex}
                    aria-roledescription={dragHandleProps.attributes?.["aria-roledescription"]}
                    aria-describedby={dragHandleProps.attributes?.["aria-describedby"]}
                    {...(dragHandleProps.listeners ?? {})}
                    data-no-open="true"
                    data-dnd-handle="true"
                    className={`shrink-0 cursor-grab touch-none rounded-md text-twilight-text-muted/40 transition-[opacity,color] hover:text-twilight-text-soft active:cursor-grabbing ${
                        isBoardCard ? "-ml-1" : "-ml-2"
                    }`}
                    aria-label="Drag to reorder"
                >
                    <GripVertical size={16} aria-hidden="true" />
                </div>
            )}

            <TaskCheckbox task={task} compact={isBoardCard} />

            {/* Content */}
            <div className={`min-w-0 flex-1 ${isCompactCard ? "flex min-h-[2.75rem] items-center" : ""}`}>
                <div className="flex-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(e);
                        }}
                        aria-label={`Open ${task.title}${task.priority > 0 ? `, ${priorityConfig.label} priority` : ""}`}
                        aria-pressed={isTaskSelected}
                        className={`w-full rounded-2xl text-left cursor-pointer ${isBoardCard ? "p-0" : "p-1 -m-1"}`}
                    >
                        <div className="flex items-start gap-2">
                            {(task.isPinned || showUrgentIcon) ? (
                                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                                    {task.isPinned && (
                                        <Pin size={12} className="rotate-45 text-accent-primary" aria-label="Pinned" />
                                    )}
                                    {showUrgentIcon && (
                                        <AlertTriangle
                                            size={13}
                                            style={{ color: task.priority === 4 ? "var(--color-priority-urgent)" : "var(--color-priority-high)" }}
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                            ) : null}

                            <div className="min-w-0 flex-1">
                                <span
                                    className={`block line-clamp-2 ${
                                        isBoardCard ? "text-[15px] leading-[1.4]" : "text-[15px] leading-snug sm:text-base"
                                    } ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                                >
                                    {task.title}
                                </span>

                                {primaryCue ? (
                                    <div className={`mt-1.5 flex items-center gap-1.5 text-[12px] font-medium ${primaryCue.className}`}>
                                        {(() => {
                                            const PrimaryCueIcon = primaryCue.icon;
                                            return <PrimaryCueIcon size={12} aria-hidden="true" />;
                                        })()}
                                        <span className="truncate">{primaryCue.label}</span>
                                    </div>
                                ) : null}

                                {rationaleLabel ? (
                                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-1 text-[10px] font-medium text-accent-primary">
                                        <Sparkles size={11} aria-hidden="true" />
                                        <span className="truncate">{rationaleLabel}</span>
                                    </span>
                                ) : null}

                                {visibleSignals.length > 0 ? (
                                    <div className={`${primaryCue ? "mt-2" : "mt-1.5"} flex flex-wrap items-center gap-2`}>
                                        {visibleSignals.map((signal) => {
                                            if (signal.button) {
                                                return (
                                                    <button
                                                        key={signal.key}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsSubtasksExpanded((expanded) => !expanded);
                                                        }}
                                                        data-no-dnd="true"
                                                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text ${
                                                            shell.isPhone ? "touch-target min-h-9 px-3.5" : ""
                                                        }`}
                                                        aria-expanded={isSubtasksExpanded}
                                                        aria-label={isSubtasksExpanded ? "Collapse subtasks" : "Expand subtasks"}
                                                    >
                                                        {isSubtasksExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                                                        <span className="flex h-1.5 w-5 overflow-hidden rounded-full bg-white/[0.05]">
                                                            <span
                                                                className="h-full bg-feedback-success/60 transition-all duration-300"
                                                                style={{ width: `${(completedCount / orderedSubtasks.length) * 100}%` }}
                                                            />
                                                        </span>
                                                        <span>{signal.label}</span>
                                                    </button>
                                                );
                                            }

                                            const SignalIcon = signal.icon;
                                            return (
                                                <span
                                                    key={signal.key}
                                                    className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium ${signal.className}`}
                                                    style={signal.style}
                                                >
                                                    {signal.accentDots?.length ? (
                                                        <span className="flex items-center gap-1" aria-hidden="true">
                                                            {signal.accentDots.map((color, index) => (
                                                                <span
                                                                    key={`${signal.key}-dot-${index}`}
                                                                    className="h-1.5 w-1.5 rounded-full"
                                                                    style={{ backgroundColor: color }}
                                                                />
                                                            ))}
                                                        </span>
                                                    ) : (
                                                        <SignalIcon size={12} aria-hidden="true" />
                                                    )}
                                                    <span className="truncate">{signal.label}</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </button>

                    <AnimatePresence>
                        {isSubtasksExpanded && orderedSubtasks.length > 0 ? (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden"
                            >
                                <div className="mt-3 border-t border-white/[0.06] pt-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-muted">
                                                Subtasks
                                            </p>
                                            <p className="mt-1 text-[12px] text-twilight-text-soft">
                                                {subtaskSummary}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleAddSubtask}
                                                data-no-dnd="true"
                                                className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full px-3 text-[11px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-1 border-l border-twilight-border/25 pl-3">
                                        <AnimatePresence initial={false}>
                                            {orderedSubtasks.map((subtask, index) => (
                                                <InlineSubtaskItem
                                                    key={subtask.id}
                                                    subtask={subtask}
                                                    onToggle={(id, checked) => updateSubtask.mutate({ id, isComplete: checked })}
                                                    onDelete={(id) => deleteSubtask.mutate(id)}
                                                    onMoveUp={(id) => handleMoveSubtask(id, -1)}
                                                    onMoveDown={(id) => handleMoveSubtask(id, 1)}
                                                    canMoveUp={index > 0}
                                                    canMoveDown={index < orderedSubtasks.length - 1}
                                                    compact={shell.isPhone}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    {isAddingSubtask ? (
                                        <div className="mt-3 border-l border-twilight-border/25 pl-3">
                                            <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5">
                                                <div className="h-6 w-6 shrink-0 rounded-full border-[1.5px] border-twilight-text-muted/70" />
                                                <input
                                                    ref={addInputRef}
                                                    type="text"
                                                    data-no-dnd="true"
                                                    value={newSubtaskTitle}
                                                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleSubmitSubtask();
                                                        if (e.key === "Escape") {
                                                            setIsAddingSubtask(false);
                                                            setNewSubtaskTitle("");
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (newSubtaskTitle.trim()) handleSubmitSubtask();
                                                        else {
                                                            setIsAddingSubtask(false);
                                                            setNewSubtaskTitle("");
                                                        }
                                                    }}
                                                    placeholder="Add subtask..."
                                                    className="flex-1 min-w-0 bg-transparent text-[14px] leading-6 text-twilight-text-soft outline-none placeholder:text-twilight-text-muted"
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isAddingSubtask && orderedSubtasks.length === 0 ? (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden"
                            >
                                <div className="mt-3 border-t border-white/[0.06] pt-3">
                                    <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5">
                                        <div className="h-6 w-6 shrink-0 rounded-full border-[1.5px] border-twilight-text-muted/70" />
                                        <input
                                            ref={addInputRef}
                                            type="text"
                                            data-no-dnd="true"
                                            value={newSubtaskTitle}
                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSubmitSubtask();
                                                if (e.key === "Escape") {
                                                    setIsAddingSubtask(false);
                                                    setNewSubtaskTitle("");
                                                }
                                            }}
                                            onBlur={() => {
                                                if (newSubtaskTitle.trim()) handleSubmitSubtask();
                                                else {
                                                    setIsAddingSubtask(false);
                                                    setNewSubtaskTitle("");
                                                }
                                            }}
                                            placeholder="Add subtask..."
                                            className="flex-1 min-w-0 bg-transparent text-[14px] leading-6 text-twilight-text-soft outline-none placeholder:text-twilight-text-muted"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </div>

            {/* Context menu — subtly visible, full opacity on hover */}
            <div data-no-dnd="true" className={`${isBoardCard ? "absolute right-2 top-2 pointer-coarse:opacity-100 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" : `pointer-coarse:opacity-100 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${isCompactCard ? "" : "pt-0.5"}`}`}>
                <TaskContextMenu task={task} onAddSubtask={holdingContext ? undefined : handleAddSubtask} onRename={handleRename} holdingContext={holdingContext} />
            </div>

            <RenameTaskDialog
                taskId={isRenaming ? task.id : null}
                currentName={task.title}
                onClose={() => setIsRenaming(false)}
            />
        </article>
    );
}
