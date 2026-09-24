import { COLLECTION_ROW_SURFACE, COLLECTION_ROW_HOVER, COLLECTION_ROW_TITLE } from "./task-row-styles";
import { ThoughtMark } from "./ThoughtMark";
import { getTagTone } from "./TagSignal";
import { useState, useId } from "react";
import {
    Calendar,
    Pin,
    Repeat,
    Bell,
    BellOff,
    Clock,
    CalendarClock,
    Tag as TagIcon,
    Sparkles,
    GripVertical,
    type LucideIcon,
} from "lucide-react";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskContextMenu } from "./TaskContextMenu";
import { RenameTaskDialog } from "./RenameTaskDialog";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "./task-choice-options";
import { InlineSubtaskPanel, SUBTASK_RAIL, SubtaskChip, useInlineSubtasks } from "./InlineSubtasks";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import { formatShortDate, toISODate } from "../../lib/utils/date-format";
import { getTaskScheduleSummary, isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import type { Tag } from "@cadence/contracts/tag";
import type { Subtask } from "@cadence/contracts/subtask";
import type { Task } from "@cadence/contracts/task";

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

const OVERDUE_RATIONALE_LABEL = "This task is past its due date";

type CollapsedSignal = {
    key: string;
    icon: LucideIcon;
    label: string;
    className: string;
    style?: React.CSSProperties;
    accentDots?: string[];
};

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

    const { toggleTask, selectedTaskIds } = useTaskSelectionStore();
    const shell = useShellMode();

    const subtaskUi = useInlineSubtasks(task.id);
    const subtaskPanelId = useId();

    // Override isSelected if managed by global store
    const isGloballySelected = selectedTaskIds.has(task.id);
    const isTaskSelected = isGloballySelected || isSelected;

    const scheduleSummary = getTaskScheduleSummary(task);
    const scheduleLabel = scheduleSummary.primaryLabel;
    const isPastDue = Boolean(
        scheduleSummary.anchorDate
        && scheduleSummary.anchorDate < toISODate(new Date())
        && task.state !== "COMPLETE"
        && task.state !== "ARCHIVED",
    );
    const isPassiveTimetable = isPassiveTimetableTask(task);
    const orderedSubtasks = [...subtasks].sort((a, b) => a.orderIndex - b.orderIndex);
    const tagSummary = tags.length === 1 ? tags[0]?.name ?? "1 tag" : `${tags.length} tags`;
    const primaryTagTone = getTagTone(tags[0]);
    const tagAccentDots = tags
        .slice(0, 2)
        .map((tag) => getTagTone(tag).accentColor);
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
                label: `Hidden until ${formatShortDate(task.notBefore)}`,
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
                icon: EFFORT_OPTIONS.find((o) => o.value === task.effort)!.icon,
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
    const hasCollapsedSupport = Boolean(primaryCue || visibleSignals.length > 0 || orderedSubtasks.length > 0);
    const isCompactCard = !hasCollapsedSupport && !subtaskUi.open && !subtaskUi.adding;
    const subtasksShown = (subtaskUi.open && orderedSubtasks.length > 0) || subtaskUi.adding;
    const isBoardCard = variant === "board";
    const effectiveRationaleLabel = rationaleLabel === OVERDUE_RATIONALE_LABEL ? null : rationaleLabel;

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
                ${COLLECTION_ROW_SURFACE} flex cursor-pointer
                ${isBoardCard
                    ? `${isCompactCard ? "items-center gap-2 px-3.5 py-3" : "items-start gap-2 px-3.5 py-3.5"}`
                    : `${isCompactCard ? "items-center gap-2.5 px-4 py-3.5 sm:px-5 sm:py-3.5" : "items-start gap-2.5 px-4 py-4 sm:px-5 sm:py-5"}`
                }
                ${task.state === "WAITING" ? "border-moonlit/25" : ""}
                ${isPassiveTimetable ? PASSIVE_TIMETABLE_CARD_CLASS : ""}
                ${isComplete ? "opacity-45" : ""}
                ${isTaskSelected
                    ? "bg-white/[0.04] ring-1 ring-accent-primary/15"
                    : `${COLLECTION_ROW_HOVER} ${PRIORITY_BG_CLASS[task.priority]}`
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
                    // Same box as the checkbox so the grip centres on the title line; -mr pulls it in past the gap.
                    className={`-mr-1.5 flex shrink-0 cursor-grab touch-none items-center rounded-md text-twilight-text-muted/40 transition-[opacity,color] hover:text-twilight-text-soft active:cursor-grabbing ${
                        isBoardCard ? "-ml-1 h-8" : "-ml-2 mt-0.5 h-11 lg:h-8"
                    }`}
                    aria-label="Drag to reorder"
                >
                    <GripVertical size={16} aria-hidden="true" />
                </div>
            )}

            {subtasksShown ? (
                // The checkbox column stretches so its rail runs down beside the open subtasks.
                <div className="flex shrink-0 flex-col items-center self-stretch">
                    <TaskCheckbox task={task} compact={isBoardCard} />
                    <span aria-hidden="true" className={`mt-1 flex-1 ${SUBTASK_RAIL}`} />
                </div>
            ) : (
                <TaskCheckbox task={task} compact={isBoardCard} />
            )}

            {task.origin === "thought" && <ThoughtMark />}

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
                        {/* Board titles (21px line) drop onto the 32px checkbox's centre line, with the grip. */}
                        <div className={`flex items-start gap-2 ${isBoardCard ? "pt-[5px]" : ""}`}>
                            {(task.isPinned || showUrgentIcon) ? (
                                <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                                    {task.isPinned && (
                                        <Pin size={12} className="rotate-45 text-accent-primary" aria-label="Pinned" />
                                    )}
                                    {showUrgentIcon && (() => {
                                        const PriorityIcon = PRIORITY_OPTIONS[task.priority].icon;
                                        return (
                                        <PriorityIcon
                                            size={13}
                                            style={{ color: task.priority === 4 ? "var(--color-priority-urgent)" : "var(--color-priority-high)" }}
                                            aria-hidden="true"
                                        />
                                        );
                                    })()}
                                </div>
                            ) : null}

                            <div className="min-w-0 flex-1">
                                <span
                                    className={`block line-clamp-2 ${
                                        // Board cards float the ⋮ over the corner; keep the title clear of it.
                                        isBoardCard ? "pr-5 pointer-coarse:pr-6 text-[15px] leading-[1.4]" : COLLECTION_ROW_TITLE
                                    } ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                                >
                                    {task.title}
                                </span>

                                {primaryCue ? (
                                    <div className={`mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] font-medium ${primaryCue.className}`}>
                                        {(() => {
                                            const PrimaryCueIcon = primaryCue.icon;
                                            return <PrimaryCueIcon size={12} aria-hidden="true" />;
                                        })()}
                                        <span className="truncate">{primaryCue.label}</span>
                                        {scheduleLabel && isPastDue ? (
                                            <span className="shrink-0 text-[11px] font-semibold text-[var(--color-priority-high)]">
                                                (Past Due)
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}

                                {effectiveRationaleLabel ? (
                                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-1 text-[10px] font-medium text-accent-primary">
                                        <Sparkles size={11} aria-hidden="true" />
                                        <span className="truncate">{effectiveRationaleLabel}</span>
                                    </span>
                                ) : null}

                                {visibleSignals.length > 0 ? (
                                    <div className={`${primaryCue ? "mt-2" : "mt-1.5"} flex flex-wrap items-center gap-2`}>
                                        {visibleSignals.map((signal) => {
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

                    {orderedSubtasks.length > 0 ? (
                        <div className="mt-1">
                            <SubtaskChip
                                subtasks={orderedSubtasks}
                                open={subtaskUi.open}
                                onToggle={subtaskUi.toggle}
                                controls={subtaskPanelId}
                            />
                        </div>
                    ) : null}

                    <InlineSubtaskPanel
                        id={subtaskPanelId}
                        taskId={task.id}
                        subtasks={orderedSubtasks}
                        open={subtaskUi.open}
                        adding={subtaskUi.adding}
                        onAddingChange={subtaskUi.setAdding}
                    />
                </div>
            </div>

            {/* Context menu — subtly visible, full opacity on hover */}
            <div data-no-dnd="true" className={`${isBoardCard ? "absolute right-1.5 top-2 pointer-coarse:right-2 pointer-fine:top-2.5 pointer-coarse:opacity-100 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" : `pointer-coarse:opacity-100 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${isCompactCard ? "" : "pt-0.5"}`}`}>
                <TaskContextMenu task={task} onAddSubtask={holdingContext ? undefined : subtaskUi.startAdding} onRename={handleRename} holdingContext={holdingContext} />
            </div>

            <RenameTaskDialog
                taskId={isRenaming ? task.id : null}
                currentName={task.title}
                onClose={() => setIsRenaming(false)}
            />
        </article>
    );
}
