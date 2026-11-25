import {
    COLLECTION_ROW_SURFACE,
    COLLECTION_ROW_HOVER,
    COLLECTION_ROW_SELECTED,
    COLLECTION_ROW_TITLE,
} from "./task-row-styles";
import { ThoughtMark } from "./ThoughtMark";
import { getTagTone } from "./TagSignal";
import { useState, useId } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
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
import { useTaskAccess } from "../../hooks/sharing/use-list-access";
import { SharedMark } from "../sharing/SharedMark";
import { RenameTaskDialog } from "./RenameTaskDialog";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "./task-choice-options";
import { InlineSubtaskPanel, SUBTASK_RAIL, SubtaskChip, useInlineSubtasks } from "./InlineSubtasks";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import { formatShortDate } from "../../lib/utils/date-format";
import { useToday } from "../../lib/utils/user-zone";
import { getTaskScheduleSummary, isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import type { Tag } from "@cadence/contracts/tag";
import type { Subtask } from "@cadence/contracts/subtask";
import type { Task } from "@cadence/contracts/task";
import { PendingMark } from "../shared/PendingMark";

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
    /** True when rendered inside the task's own list page (shows avatar only, without the shared Users glyph). */
    inList?: boolean;
    /** Optional smart-sort rationale label */
    rationaleLabel?: string | null;
    /** dnd-kit drag handle props — scopes drag to an explicit grip handle */
    dragHandleProps?: {
        ref: (node: HTMLElement | null) => void;
        listeners: DraggableSyntheticListeners;
        attributes: DraggableAttributes;
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
    2: "[--row-wash:color-mix(in_srgb,var(--color-priority-medium)_2%,transparent)]",
    3: "[--row-wash:color-mix(in_srgb,var(--color-priority-high)_2%,transparent)]",
    4: "[--row-wash:color-mix(in_srgb,var(--color-priority-urgent)_3%,transparent)]",
};

/** Board titles keep clear of the corner cluster: the ⋮, plus room for each of shared and pinned. */
const BOARD_TITLE_CLEAR = ["pr-5 pointer-coarse:pr-6", "pr-12 pointer-coarse:pr-14", "pr-18 pointer-coarse:pr-20"];

const PASSIVE_TIMETABLE_CARD_CLASS =
    "border-moonlit/22 [--row-wash:rgba(126,184,212,0.055)] shadow-[inset_0_1px_0_rgba(126,184,212,0.08)]";

const EFFORT_LABELS: Record<1 | 2 | 3, string> = {
    1: "Light effort",
    2: "Medium effort",
    3: "Deep effort",
};

interface CollapsedSignal {
    key: string;
    icon: LucideIcon;
    label: string;
    className: string;
    style?: React.CSSProperties;
    accentDots?: string[];
}

type ScheduleSummary = ReturnType<typeof getTaskScheduleSummary>;

type PrimaryCue = { icon: LucideIcon; label: string; className: string };

/** The one line a card leads with: when it happens, else who it waits on, else that it repeats. */
function primaryCueOf(task: Task, scheduleSummary: ScheduleSummary, isPassiveTimetable: boolean): PrimaryCue | null {
    const scheduleLabel = scheduleSummary.primaryLabel;
    if (scheduleLabel) {
        const emphasis =
            scheduleSummary.isDeadline || scheduleSummary.isDuration
                ? "text-accent-primary"
                : "text-twilight-text-soft";
        return {
            icon: isPassiveTimetable ? CalendarClock : Calendar,
            label: scheduleLabel,
            className: isPassiveTimetable ? "text-moonlit" : emphasis,
        };
    }
    if (task.waitingOn) {
        return { icon: Clock, label: `Waiting on ${task.waitingOn}`, className: "text-moonlit" };
    }
    return task.recurrenceRule ? { icon: Repeat, label: "Repeating task", className: "text-twilight-text-soft" } : null;
}

/** One chip for the tags: the first one's name (or how many), in its tone, with up to two dots. */
function tagSignal(tags: Tag[]): CollapsedSignal | null {
    if (tags.length === 0) return null;
    const primaryTagTone = getTagTone(tags[0]);
    return {
        key: "tags",
        icon: TagIcon,
        label: tags.length === 1 ? (tags[0]?.name ?? "1 tag") : `${tags.length} tags`,
        className: "",
        style: {
            backgroundColor: primaryTagTone.backgroundColor,
            borderColor: primaryTagTone.borderColor,
            color: primaryTagTone.color,
        },
        accentDots: tags.slice(0, 2).map((tag) => getTagTone(tag).accentColor),
    };
}

/** Reminders on the task: a waiting check-in, and its own reminder (or that it is silenced). */
function reminderSignals(task: Task): Array<CollapsedSignal | null> {
    return [
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
    ];
}

/** The one line a card leads with, plus the quieter chips under it. */
function getTaskCues(task: Task, tags: Tag[], scheduleSummary: ScheduleSummary, isPassiveTimetable: boolean) {
    const scheduleLabel = scheduleSummary.primaryLabel;
    const primaryCue = primaryCueOf(task, scheduleSummary, isPassiveTimetable);

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
        tagSignal(tags),
        task.effort
            ? {
                  key: "effort",
                  icon: EFFORT_OPTIONS[task.effort - 1].icon,
                  label: EFFORT_LABELS[task.effort],
                  className: "text-twilight-text-soft",
              }
            : null,
        ...reminderSignals(task),
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
    return { primaryCue, secondarySignals };
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
    inList,
    rationaleLabel,
    dragHandleProps,
}: TaskCardProps) {
    const isComplete = task.state === "COMPLETE";
    const isInList =
        inList ??
        (typeof window !== "undefined" &&
            (window.location.pathname.startsWith("/project/") || window.location.pathname.startsWith("/projects/")));
    // A list you can only view: no check-off, drag or renaming. A shared one shows who made each task.
    const access = useTaskAccess(task);
    const priorityConfig = PRIORITY_CONFIG[task.priority];
    const showUrgentIcon = task.priority >= 3;
    const PriorityIcon = PRIORITY_OPTIONS[task.priority].icon;

    const { toggleTask, selectedTaskIds } = useTaskSelectionStore();
    const shell = useShellMode();
    const todayDay = useToday();

    const subtaskUi = useInlineSubtasks(task.id);
    const subtaskPanelId = useId();

    // Override isSelected if managed by global store
    const isGloballySelected = selectedTaskIds.has(task.id);
    const isTaskSelected = isGloballySelected || isSelected;

    const scheduleSummary = getTaskScheduleSummary(task);
    const scheduleLabel = scheduleSummary.primaryLabel;
    const isPassiveTimetable = isPassiveTimetableTask(task);
    const isPastDue = Boolean(
        !isPassiveTimetable &&
        scheduleSummary.anchorDate &&
        scheduleSummary.anchorDate < todayDay &&
        task.state !== "COMPLETE" &&
        task.state !== "ARCHIVED",
    );
    const orderedSubtasks = [...subtasks].sort((a, b) => a.orderIndex - b.orderIndex);
    const { primaryCue, secondarySignals } = getTaskCues(task, tags, scheduleSummary, isPassiveTimetable);

    const visibleSignals = secondarySignals.slice(0, shell.isPhone ? 2 : 3);
    const hasCollapsedSupport = Boolean(primaryCue || visibleSignals.length > 0 || orderedSubtasks.length > 0);
    const isCompactCard = !hasCollapsedSupport && !subtaskUi.open && !subtaskUi.adding;
    const subtasksShown = (subtaskUi.open && orderedSubtasks.length > 0) || subtaskUi.adding;
    const isBoardCard = variant === "board";
    // A box one title line tall (the title text sits 2px into its row); side controls centre on its first line.
    const titleLine = `${COLLECTION_ROW_TITLE} flex h-lh shrink-0 items-center ${isCompactCard ? "" : "mt-0.5 self-start"}`;

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
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- pointer convenience; keyboard path is on the inner controls
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
                ${
                    isBoardCard
                        ? isCompactCard
                            ? "items-center gap-2 px-3.5 py-3"
                            : "items-start gap-2 px-3.5 py-3.5"
                        : isCompactCard
                          ? "items-center gap-2.5 px-4 py-3.5 sm:px-5 sm:py-3.5"
                          : "items-start gap-2.5 px-4 py-4 sm:px-5 sm:py-5"
                }
                ${task.state === "WAITING" ? "border-moonlit/25" : ""}
                ${isPassiveTimetable ? PASSIVE_TIMETABLE_CARD_CLASS : ""}
                ${isComplete ? "opacity-45" : ""}
                ${
                    isTaskSelected
                        ? `${COLLECTION_ROW_SELECTED} ring-1 ring-accent-primary/15`
                        : `${COLLECTION_ROW_HOVER} ${isDropTarget || isPassiveTimetable ? "" : PRIORITY_BG_CLASS[task.priority]}`
                }
                ${isDropTarget ? "ring-1 ring-moonlit/30 border-moonlit/35 [--row-wash:color-mix(in_srgb,var(--color-moonlit)_3.5%,transparent)]" : ""}
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

            {/* Grip and checkbox sit in boxes one title line tall, so they centre on its first line; their hit areas overflow. */}
            {dragHandleProps && access.canEdit && (
                <div className={isBoardCard ? "-ml-1 -mr-1.5 flex" : `${titleLine} -ml-2 -mr-1.5`}>
                    <div
                        ref={dragHandleProps.ref}
                        role={dragHandleProps.attributes?.role}
                        tabIndex={dragHandleProps.attributes?.tabIndex}
                        aria-roledescription={dragHandleProps.attributes?.["aria-roledescription"]}
                        aria-describedby={dragHandleProps.attributes?.["aria-describedby"]}
                        {...(dragHandleProps.listeners ?? {})}
                        data-no-open="true"
                        data-dnd-handle="true"
                        className={`flex shrink-0 cursor-grab touch-none items-center rounded-md text-twilight-text-muted/40 transition-[opacity,color] hover:text-twilight-text-soft active:cursor-grabbing ${
                            isBoardCard ? "h-8" : "h-11 lg:h-8"
                        }`}
                        aria-label="Drag to reorder"
                    >
                        <GripVertical size={16} aria-hidden="true" />
                    </div>
                </div>
            )}

            {/* With subtasks open the checkbox column stretches so its rail runs down beside them. */}
            <div className={`flex shrink-0 flex-col items-center ${subtasksShown ? "self-stretch" : ""}`}>
                {isBoardCard ? (
                    <TaskCheckbox task={task} compact />
                ) : (
                    <div className={titleLine}>
                        <TaskCheckbox task={task} />
                    </div>
                )}
                {subtasksShown && <span aria-hidden="true" className={`mt-1 flex-1 ${SUBTASK_RAIL}`} />}
            </div>

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
                        <div className={`flex items-start gap-2 ${isBoardCard && !isCompactCard ? "pt-[5px]" : ""}`}>
                            {showUrgentIcon ? (
                                <PriorityIcon
                                    size={13}
                                    className="mt-0.5 shrink-0"
                                    style={{
                                        color:
                                            task.priority === 4
                                                ? "var(--color-priority-urgent)"
                                                : "var(--color-priority-high)",
                                    }}
                                    aria-hidden="true"
                                />
                            ) : null}

                            <div className="min-w-0 flex-1">
                                <span
                                    className={`block line-clamp-2 ${
                                        // Board cards float the ⋮ over the corner; keep the title clear of it.
                                        isBoardCard
                                            ? `${BOARD_TITLE_CLEAR[Number(access.isShared) + Number(task.isPinned)]} text-[15px] leading-[1.4]`
                                            : COLLECTION_ROW_TITLE
                                    } ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                                >
                                    {task.title}
                                    <PendingMark id={task.id} />
                                </span>

                                {/* The date reads first; when it's past, only "Past due" carries colour. */}
                                {primaryCue ? (
                                    <div
                                        className={`mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] font-medium ${isPastDue ? "text-twilight-text-soft" : primaryCue.className}`}
                                    >
                                        <primaryCue.icon size={12} aria-hidden="true" className="shrink-0" />
                                        <span className="truncate">{primaryCue.label}</span>
                                        {scheduleLabel && isPastDue ? (
                                            <span className="ml-1 shrink-0 text-[var(--color-priority-high)]">
                                                Past due
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}

                                {rationaleLabel ? (
                                    <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-twilight-text-soft">
                                        <Sparkles
                                            size={12}
                                            aria-hidden="true"
                                            className="shrink-0 text-accent-primary"
                                        />
                                        <span className="truncate">{rationaleLabel}</span>
                                    </p>
                                ) : null}

                                {visibleSignals.length > 0 ? (
                                    <div
                                        className={`${primaryCue ? "mt-2.5" : "mt-1.5"} flex flex-wrap items-center gap-2`}
                                    >
                                        {visibleSignals.map((signal) => (
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
                                                    <signal.icon size={12} aria-hidden="true" />
                                                )}
                                                <span className="truncate">{signal.label}</span>
                                            </span>
                                        ))}
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

                    <fieldset disabled={!access.canEdit} className="contents">
                        <InlineSubtaskPanel
                            id={subtaskPanelId}
                            taskId={task.id}
                            subtasks={orderedSubtasks}
                            open={subtaskUi.open}
                            adding={subtaskUi.adding}
                            onAddingChange={subtaskUi.setAdding}
                        />
                    </fieldset>
                </div>
            </div>

            {/* Pin, creator and ⋮ sit together: in the top corner on a board, else one title line tall so they centre on its first line. */}
            <div
                className={
                    isBoardCard
                        ? `absolute right-1.5 flex items-center gap-2 pointer-coarse:right-2 ${isCompactCard ? "top-4" : "top-2 pointer-fine:top-3"}`
                        : `${titleLine} gap-2.5`
                }
            >
                {task.isPinned ? (
                    <Pin size={12} aria-label="Pinned" className="shrink-0 rotate-45 text-accent-primary" />
                ) : null}
                {access.isShared && task.projectId ? (
                    <div data-no-open="true" data-no-dnd="true" className="flex shrink-0">
                        <SharedMark task={task} inList={isInList} size={16} />
                    </div>
                ) : null}

                {/* Context menu — subtly visible, full opacity on hover */}
                <div
                    data-no-dnd="true"
                    className={`pointer-coarse:opacity-100 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
                        isBoardCard ? "" : "-mr-2.5 shrink-0 sm:-mr-3.5"
                    }`}
                >
                    <TaskContextMenu
                        task={task}
                        onAddSubtask={holdingContext ? undefined : subtaskUi.startAdding}
                        onRename={handleRename}
                        onOpen={() => onSelect?.(task.id)}
                        holdingContext={holdingContext}
                    />
                </div>
            </div>

            <RenameTaskDialog
                taskId={isRenaming ? task.id : null}
                currentName={task.title}
                onClose={() => setIsRenaming(false)}
            />
        </article>
    );
}
