import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import {
    X, MoreHorizontal, Calendar, Bell, Tag, FolderOpen, Zap,
    Pin, Repeat, CalendarRange, Trash2, SlidersHorizontal,
    CircleDot, Gauge, CalendarOff, Clock, Plus, Pencil, Maximize2, Minimize2,
    ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTasks, useUpdateTask, useArchiveTask, useCreateSubtask } from "../../hooks/tasks";
import { useProjects } from "../../hooks/projects";
import { useDebouncedCallback } from "../../hooks/core/use-debounced-callback";
import { useSubtasks } from "../../hooks/tasks/use-subtasks";
import { useTaskNote } from "../../hooks/tasks/use-task-note";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { PriorityPicker } from "./PriorityPicker";
import { TagPickerList } from "./TagPickerSubmenu";
import { TagBubble } from "../sidebar/TagBubble";
import { useTags, useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags";
import { SubtaskList } from "./SubtaskList";
import { TaskNoteSaveStatus } from "./TaskNoteSaveStatus";
import { getNoteScopeLabel, isSeriesScopedNote } from "../../lib/notes/recurring-note-scope";
import * as Separator from "../primitives/Separator";
import * as Tooltip from "../primitives/Tooltip";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { Skeleton } from "../primitives/Skeleton";
import { Switch } from "../primitives/Switch";
import { formatShortDate, formatShortDateTime } from "../../lib/utils/date-format";
import { PRIORITY_CONFIG } from "../../lib/utils/priority";
import {
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    isPassiveTimetableTask,
    isRecurringTask,
} from "../../lib/utils/task-scheduling";
import type { Task, TaskPriority, TaskState, EffortLevel } from "../../types/task";
import { ImmersiveDetailLayout } from "../shared/ImmersiveDetailLayout";
import { useNoteRoomStore } from "../../stores/note-room-store";

const MarkdownEditor = lazy(() => import("./MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })));

interface TaskEditPanelProps {
    taskId: string;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}

function formatDateTime(iso: string) {
    return formatShortDate(iso);
}

const segmentedControlClass = "flex max-w-full flex-wrap justify-end gap-0.5 rounded-xl bg-white/[0.04] p-0.5";
const stackedPanelTriggerClass = "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[1.15rem] border border-twilight-border/35 bg-white/[0.025] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] hover:border-twilight-border/50 focus-visible:ring-1 focus-visible:ring-lantern/30";

const MetaRow = React.memo(function MetaRow({
    icon: Icon,
    label,
    children,
}: {
    icon: React.ElementType;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid grid-cols-[auto,5rem,minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-2.5" role="group" aria-label={label}>
            <Icon
                size={15}
                className="mt-1 shrink-0 text-twilight-text-muted"
                aria-hidden="true"
            />
            <span className="pt-0.5 text-[13px] text-twilight-text-muted">{label}</span>
            <div className="min-w-0 pt-0.5">{children}</div>
        </div>
    );
});

/** Full task editing panel — notes-first design; metadata revealed on demand */
export function TaskEditPanel({
    taskId,
    onClose,
    detailMode = "peek",
    onDetailModeChange,
}: TaskEditPanelProps) {
    const { data: activeTasks } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks } = useTasks({ state: "WAITING" });
    const { data: archiveTasks } = useTasks({ state: "ARCHIVED" });
    const { data: doneTasks } = useTasks({ state: "COMPLETE" });
    const { data: projects } = useProjects();
    const updateTask = useUpdateTask();
    const archiveTask = useArchiveTask();
    const createSubtask = useCreateSubtask(taskId);
    const { data: tags } = useTags();
    const addTagAssoc = useAddTaskTag();
    const removeTagAssoc = useRemoveTaskTag();
    const openNoteRoom = useNoteRoomStore((s) => s.open);

    // Find the task across all caches
    const task = useMemo(
        () => [...(activeTasks ?? []), ...(waitingTasks ?? []), ...(archiveTasks ?? []), ...(doneTasks ?? [])].find(
            (t) => t.id === taskId
        ),
        [activeTasks, waitingTasks, archiveTasks, doneTasks, taskId],
    );

    const [title, setTitle] = useState(task?.title ?? "");
    const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? "");
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [activePanel, setActivePanel] = useState<"notes" | "subtasks" | "details">("notes");
    const titleRef = useRef<HTMLInputElement>(null);
    const { data: subtasks = [] } = useSubtasks(taskId);

    // Unified note state — shared between inline editor and Writing Room
    const { draft: notes, onChange: onNotesChange, saveStatus } = useTaskNote(taskId);

    // Sync title & waitingOn when task loads
    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setWaitingOn(task.waitingOn ?? "");
        }
    }, [task]);

    useEffect(() => {
        setActivePanel("notes");
    }, [taskId]);

    // Listen for the custom rename event dispatched by context menus
    useEffect(() => {
        const handleFocusTitle = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.taskId === taskId) {
                titleRef.current?.focus();
                titleRef.current?.select();
            }
        };
        window.addEventListener("cadence:focus-task-title", handleFocusTitle);
        return () => window.removeEventListener("cadence:focus-task-title", handleFocusTitle);
    }, [taskId]);

    const debouncedSaveWaitingOn = useDebouncedCallback((content: string) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, waitingOn: content || null });
    }, 800);

    const convertibleNoteLines = useMemo(
        () =>
            notes
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => /^(-|\*|\d+\.)\s+/.test(line))
                .map((line) => line.replace(/^(-|\*|\d+\.)\s+/, "").trim())
                .filter(Boolean),
        [notes],
    );

    const handleTitleBlur = () => {
        if (!task || title.trim() === task.title) return;
        if (!title.trim()) {
            setTitle(task.title);
            return;
        }
        updateTask.mutate({ id: task.id, title: title.trim() });
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
            setTitle(task?.title ?? "");
            (e.target as HTMLInputElement).blur();
        }
    };

    const handleWaitingOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setWaitingOn(e.target.value);
        debouncedSaveWaitingOn(e.target.value);
    };

    const handlePriorityChange = (priority: TaskPriority) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, priority });
    };

    const handleStateChange = (state: TaskState) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, state });
    };

    const handleEffortChange = (level: EffortLevel) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, effort: task.effort === level ? null : level });
    };

    const handlePinToggle = () => {
        if (!task) return;
        updateTask.mutate({ id: task.id, isPinned: !task.isPinned });
    };

    const handleDeadlineChange = (updates: {
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd?: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }) => {
        if (!task) return;
        updateTask.mutate({
            id: task.id,
            dueDate: updates.dueDate,
            scheduledStart: updates.scheduledStart,
            scheduledEnd: updates.scheduledEnd ?? null,
            recurrenceRule: updates.recurrenceRule,
            isAllDay: updates.isAllDay,
        });
    };

    const handleDelete = () => {
        if (!task) return;
        archiveTask.mutate(task.id);
        onClose();
    };

    const project = projects?.find((p) => p.id === task?.projectId);

    const scheduleSummary = task ? getTaskScheduleSummary(task) : null;
    const recurrenceSummary = task ? getTaskRecurrenceSummary(task) : null;
    const isPassiveTimetable = task ? isPassiveTimetableTask(task) : false;
    const canToggleInteractionMode = Boolean(task?.recurrenceRule && task?.scheduledStart && task?.isAllDay === false);
    const scheduleLabel = recurrenceSummary?.label ?? scheduleSummary?.primaryLabel ?? "No schedule";
    const scheduleFieldLabel = task && isRecurringTask(task)
        ? "Series"
        : scheduleSummary?.isDuration
            ? "Duration"
            : scheduleSummary?.isTimed
                ? (isPassiveTimetable ? "Anchor" : "Time block")
                : "Deadline";

    const charCount = notes.length;
    const maxChars = 50000;
    const completedSubtasks = subtasks.filter((subtask) => subtask.isComplete).length;
    const subtaskSummary = subtasks.length
        ? `${completedSubtasks}/${subtasks.length} complete`
        : "No subtasks yet";
    const noteSummary = notes.trim() ? `${charCount.toLocaleString()} chars` : "Tap to write notes";
    const detailsSummary = "Priority, schedule, tags, state";

    return (
        <motion.div
            className="h-full overflow-hidden"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            role="complementary"
            aria-label="Task details"
        >
            {!task ? (
                <div className="flex h-full flex-col">
                    <div className="flex items-center gap-3 border-b border-twilight-border px-5 h-14 shrink-0">
                        <Skeleton className="h-7 w-7 rounded-lg" />
                        <Skeleton className="h-4 flex-1 rounded-lg" />
                        <Skeleton className="h-7 w-7 rounded-lg" />
                    </div>
                    <div className="flex flex-col gap-3 p-5">
                        <Skeleton className="h-40 w-full rounded-2xl" />
                        <Skeleton className="h-14 w-full rounded-2xl" />
                        <Skeleton className="h-14 w-full rounded-2xl" />
                    </div>
                </div>
            ) : (
                <ImmersiveDetailLayout
                    mode={detailMode}
                    header={(
                        <div className="flex items-center gap-3 border-b border-twilight-border px-5 h-14 shrink-0">
                        <div className="flex-1 min-w-0 relative group flex items-center">
                            <input
                                ref={titleRef}
                                type="text"
                                value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            aria-label="Task title"
                            className="peer flex-1 min-w-0 cursor-text bg-transparent font-display text-sm font-medium text-twilight-text outline-none placeholder:text-twilight-text-muted/80 truncate"
                            placeholder="Task title"
                            />
                            <div className="absolute right-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity text-twilight-text-muted peer-focus:opacity-0 flex items-center justify-center">
                                <Pencil size={13} aria-hidden="true" />
                            </div>
                        </div>

                        {onDetailModeChange ? (
                            <button
                                type="button"
                                onClick={() => {
                                    onDetailModeChange(detailMode === "focus" ? "peek" : "focus");
                                }}
                                aria-label={detailMode === "focus" ? "Back to split view" : "Expand editor"}
                                className={`w-7 h-7 cursor-pointer rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                    detailMode === "focus"
                                        ? "text-lantern bg-lantern/10"
                                        : "text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                }`}
                            >
                                {detailMode === "focus" ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
                            </button>
                        ) : null}

                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    type="button"
                                    aria-label="Task actions"
                                    aria-haspopup="menu"
                                    className="w-7 h-7 cursor-pointer rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0"
                                >
                                    <MoreHorizontal size={15} aria-hidden="true" />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end">
                                {task.recurrenceRule && (
                                    <DropdownMenu.Item onSelect={() => handleStateChange("ARCHIVED")} className="flex items-center gap-2">
                                        <Calendar size={14} aria-hidden="true" />
                                        Archive series
                                    </DropdownMenu.Item>
                                )}
                                <DropdownMenu.Item
                                    className="flex items-center gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
                                    onSelect={handleDelete}
                                >
                                    <Trash2 size={14} aria-hidden="true" />
                                    {task.recurrenceRule ? "Move series to Trash" : "Move to Trash"}
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close task details"
                            className="w-7 h-7 cursor-pointer rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0"
                        >
                            <X size={15} aria-hidden="true" />
                        </button>
                        </div>
                    )}
                >

                    <div className="flex h-full min-h-0 flex-col overflow-y-auto scrollbar-thin px-5 pb-5 pt-5 gap-3">
                        {/* ── Notes pane ── */}
                        {activePanel !== "notes" ? (
                            <button
                                type="button"
                                onClick={() => setActivePanel("notes")}
                                className={stackedPanelTriggerClass}
                            >
                                <div>
                                    <p className="text-sm font-medium text-twilight-text">Notes</p>
                                    <p className="text-xs text-twilight-text-muted">{noteSummary}</p>
                                </div>
                                <Pencil size={14} className="text-twilight-text-muted" aria-hidden="true" />
                            </button>
                        ) : null}

                        <AnimatePresence initial={false}>
                            {activePanel === "notes" ? (
                                <motion.div
                                    key="notes-panel"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                    className="flex shrink-0 flex-col gap-3"
                                >
                                    <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
                                        <MarkdownEditor
                                            notes={notes}
                                            isEditing={isEditingNotes}
                                            setIsEditing={setIsEditingNotes}
                                            onNotesChange={onNotesChange}
                                            maxLength={maxChars}
                                        />
                                    </Suspense>

                                    <button
                                        type="button"
                                        onClick={() => openNoteRoom(task.id, task.title)}
                                        className="flex cursor-pointer items-center justify-center gap-2 rounded-[1.15rem] border border-twilight-border/35 bg-white/[0.025] px-4 py-2.5 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text"
                                    >
                                        <ExternalLink size={13} aria-hidden="true" />
                                        Open writing room
                                    </button>

                                    {convertibleNoteLines.length > 0 ? (
                                        <div className="flex items-center justify-between rounded-[1.2rem] border border-twilight-border/35 bg-white/[0.025] px-4 py-3">
                                            <div>
                                                <p className="text-sm text-twilight-text">Turn note bullets into subtasks</p>
                                                <p className="text-xs text-twilight-text-muted">
                                                    Cadence found {convertibleNoteLines.length} structured line{convertibleNoteLines.length === 1 ? "" : "s"} in this note.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const baseOrder = Date.now();
                                                    convertibleNoteLines.forEach((line, index) => {
                                                        createSubtask.mutate({ title: line, orderIndex: baseOrder + index });
                                                    });
                                                }}
                                                className="cursor-pointer rounded-xl border border-lantern/20 bg-lantern/10 px-3 py-2 text-xs font-medium text-lantern transition-colors hover:bg-lantern/16"
                                            >
                                                Create subtasks
                                            </button>
                                        </div>
                                    ) : null}

                                    <div className="flex items-center justify-between shrink-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] text-twilight-text-muted/90 leading-relaxed" aria-label="Task metadata">
                                                Created {formatDateTime(task.createdAt)}
                                                {task.updatedAt !== task.createdAt && (
                                                    <> · Updated {formatDateTime(task.updatedAt)}</>
                                                )}
                                            </p>
                                            {isSeriesScopedNote(task) && (
                                                <span className="rounded-md bg-moonlit/10 px-1.5 py-0.5 text-[10px] font-medium text-moonlit">
                                                    {getNoteScopeLabel(task)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <TaskNoteSaveStatus status={saveStatus} />
                                            <span
                                                className={`text-[10px] tabular-nums ${charCount > maxChars * 0.9
                                                    ? "text-lantern"
                                                    : "text-twilight-text-muted/90"
                                                    }`}
                                                aria-live="polite"
                                                aria-label={`${charCount} of ${maxChars} characters used`}
                                            >
                                                {charCount.toLocaleString()} / {maxChars.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>

                        {/* ── Details pane ── */}
                        {activePanel !== "details" ? (
                            <button
                                type="button"
                                onClick={() => setActivePanel("details")}
                                className={stackedPanelTriggerClass}
                            >
                                <div>
                                    <p className="text-sm font-medium text-twilight-text">Details</p>
                                    <p className="text-xs text-twilight-text-muted">{detailsSummary}</p>
                                </div>
                                <SlidersHorizontal size={14} className="text-twilight-text-muted" aria-hidden="true" />
                            </button>
                        ) : null}

                        <AnimatePresence initial={false}>
                            {activePanel === "details" ? (
                                <motion.div
                                    key="details-panel"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                    className="flex flex-col overflow-hidden rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.02]"
                                >
                                    <div className="flex items-center justify-between px-4 pt-3 pb-1">
                                        <p className="text-sm font-medium text-twilight-text">Details</p>
                                        <button
                                            type="button"
                                            onClick={() => setActivePanel("notes")}
                                            className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-lantern transition-colors hover:text-lantern/80"
                                        >
                                            Back to notes
                                        </button>
                                    </div>
                                    <div className="flex flex-col divide-y divide-twilight-border/25 overflow-y-auto scrollbar-thin">
                                    {/* State */}
                                    <MetaRow icon={CircleDot} label="State">
                                        <div className={segmentedControlClass}>
                                            <button
                                                onClick={() => handleStateChange("ACTIVE")}
                                                className={`cursor-pointer px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.state === "ACTIVE" ? "bg-lantern/15 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Active
                                            </button>
                                            <button
                                                onClick={() => handleStateChange("WAITING")}
                                                className={`cursor-pointer px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.state === "WAITING" ? "bg-moonlit/15 text-moonlit shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Waiting
                                            </button>
                                            {!isPassiveTimetable ? (
                                                <button
                                                    onClick={() => handleStateChange("COMPLETE")}
                                                    className={`cursor-pointer px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.state === "COMPLETE" ? "bg-feedback-success/15 text-feedback-success shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                                >
                                                    Complete
                                                </button>
                                            ) : (
                                                <span className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium text-moonlit">
                                                    Anchor
                                                </span>
                                            )}
                                        </div>
                                    </MetaRow>

                                    {canToggleInteractionMode && (
                                        <MetaRow icon={Repeat} label="Mode">
                                            <div className={segmentedControlClass}>
                                                <button
                                                    onClick={() => updateTask.mutate({
                                                        id: task.id,
                                                        interactionMode: "timetable",
                                                        ...(task.state === "COMPLETE" ? { state: "ACTIVE" } : {}),
                                                    })}
                                                    className={`cursor-pointer px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                                                        task.interactionMode === "timetable"
                                                            ? "bg-moonlit/15 text-moonlit shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                                                            : "text-twilight-text-muted hover:text-twilight-text"
                                                    }`}
                                                >
                                                    Timetable anchor
                                                </button>
                                                <button
                                                    onClick={() => updateTask.mutate({ id: task.id, interactionMode: "task" })}
                                                    className={`cursor-pointer px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                                                        task.interactionMode === "task"
                                                            ? "bg-lantern/15 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                                                            : "text-twilight-text-muted hover:text-twilight-text"
                                                    }`}
                                                >
                                                    Needs check-off
                                                </button>
                                            </div>
                                        </MetaRow>
                                    )}

                                    <AnimatePresence>
                                        {task.state === "WAITING" && (
                                            <motion.div
                                                initial={{ opacity: 0, scaleY: 0.95 }}
                                                animate={{ opacity: 1, scaleY: 1 }}
                                                exit={{ opacity: 0, scaleY: 0.95 }}
                                                style={{ transformOrigin: "top" }}
                                                className="bg-white/[0.02]"
                                            >
                                                <div className="flex flex-col gap-2 pl-[42px] pr-5 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Clock size={13} className="text-twilight-text-muted opacity-60 shrink-0" />
                                                        <input
                                                            type="text"
                                                            value={waitingOn}
                                                            onChange={handleWaitingOnChange}
                                                            placeholder="Who or what are you waiting for?"
                                                            className="flex-1 min-w-0 bg-transparent text-[13px] text-twilight-text-soft outline-none placeholder:text-twilight-text-muted/60"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Bell size={13} className="text-twilight-text-muted opacity-60 shrink-0" />
                                                        <DeadlinePickerPopover
                                                            dueDate={null}
                                                            scheduledStart={task.waitingReminder ?? null}
                                                            recurrenceRule={null}
                                                            onChange={(updates) => updateTask.mutate({ id: task.id, waitingReminder: updates.scheduledStart ?? null })}
                                                        >
                                                            <Button variant="ghost" size="sm" asChild className="text-[13px] text-twilight-text-soft hover:text-twilight-text p-0">
                                                                <span>
                                                                    {task.waitingReminder ? `Check again: ${formatDateTime(task.waitingReminder)}` : "Set reminder..."}
                                                                </span>
                                                            </Button>
                                                        </DeadlinePickerPopover>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Not before */}
                                    <MetaRow icon={CalendarOff} label="Not before">
                                        <DeadlinePickerPopover
                                            dueDate={null}
                                            scheduledStart={task.notBefore ?? null}
                                            recurrenceRule={null}
                                            onChange={(updates) => {
                                                if (!task) return;
                                                updateTask.mutate({ id: task.id, notBefore: updates.scheduledStart ?? null });
                                            }}
                                        >
                                            <Button variant="ghost" size="sm" className="cursor-pointer text-[13px] text-twilight-text-soft hover:text-twilight-text p-0">
                                                {task.notBefore ? formatDateTime(task.notBefore) : "Not set"}
                                            </Button>
                                        </DeadlinePickerPopover>
                                    </MetaRow>

                                    {/* Effort */}
                                    <MetaRow icon={Gauge} label="Effort">
                                        <div className={`${segmentedControlClass} w-full`}>
                                            <button
                                                onClick={() => handleEffortChange(1)}
                                                className={`flex-1 cursor-pointer rounded-[10px] px-3 py-1.5 text-center text-[12px] font-medium transition-colors ${task.effort === 1 ? "bg-white/[0.08] text-twilight-text shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Low
                                            </button>
                                            <button
                                                onClick={() => handleEffortChange(2)}
                                                className={`flex-1 cursor-pointer rounded-[10px] px-3 py-1.5 text-center text-[12px] font-medium transition-colors ${task.effort === 2 ? "bg-lantern/15 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Medium
                                            </button>
                                            <button
                                                onClick={() => handleEffortChange(3)}
                                                className={`flex-1 cursor-pointer rounded-[10px] px-3 py-1.5 text-center text-[12px] font-medium transition-colors ${task.effort === 3 ? "bg-lantern/30 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                High
                                            </button>
                                        </div>
                                    </MetaRow>

                                    {/* Schedule */}
                                    <MetaRow icon={scheduleSummary?.isDuration ? CalendarRange : Calendar} label={scheduleFieldLabel}>
                                        <DeadlinePickerPopover
                                            dueDate={task.dueDate}
                                            scheduledStart={task.scheduledStart}
                                            scheduledEnd={task.scheduledEnd}
                                            recurrenceRule={task.recurrenceRule}
                                            onChange={handleDeadlineChange}
                                        >
                                            <Button variant="ghost" size="sm" className="cursor-pointer text-[13px] text-twilight-text-soft hover:text-twilight-text p-0">
                                                {scheduleLabel}
                                            </Button>
                                        </DeadlinePickerPopover>
                                    </MetaRow>

                                    {/* Reminder */}
                                    <MetaRow icon={Bell} label="Reminder">
                                        <span className="text-[13px] text-twilight-text-muted/90">
                                            {task.reminderAt
                                                ? formatShortDateTime(task.reminderAt)
                                                : "None"}
                                        </span>
                                    </MetaRow>

                                    {/* Priority */}
                                    <MetaRow icon={Zap} label="Priority">
                                        <PriorityPicker
                                            currentPriority={task.priority}
                                            onSelect={handlePriorityChange}
                                        />
                                    </MetaRow>

                                    {/* Project */}
                                    <MetaRow icon={FolderOpen} label="Project">
                                        <span className="text-[13px] text-twilight-text-soft">
                                            {project?.name ?? "No project"}
                                        </span>
                                    </MetaRow>

                                    {/* Tags */}
                                    <MetaRow icon={Tag} label="Tags">
                                        <div className="flex flex-wrap items-center gap-1.5 flex-1 justify-end">
                                            {task.tagIds?.map(tagId => {
                                                const tag = tags?.find(t => t.id === tagId);
                                                if (!tag) return null;
                                                return (
                                                    <TagBubble
                                                        key={tag.id}
                                                        tag={tag}
                                                        isActive={false}
                                                        onClick={() => { }}
                                                    />
                                                );
                                            })}
                                            <DropdownMenu.Root>
                                                <DropdownMenu.Trigger asChild>
                                                    <Button variant="ghost" size="sm" className="cursor-pointer rounded-full px-2.5 py-1 text-[12px] border border-twilight-border border-dashed">
                                                        <Plus size={12} />
                                                        Add tag
                                                    </Button>
                                                </DropdownMenu.Trigger>
                                                <DropdownMenu.Content align="end" className="w-56 p-2">
                                                    <TagPickerList
                                                        activeTagIds={task.tagIds ?? []}
                                                        onAdd={(id) => addTagAssoc.mutate({ taskId: task.id, tagId: id })}
                                                        onRemove={(id) => removeTagAssoc.mutate({ taskId: task.id, tagId: id })}
                                                        MenuComponents={DropdownMenu}
                                                    />
                                                </DropdownMenu.Content>
                                            </DropdownMenu.Root>
                                        </div>
                                    </MetaRow>

                                    {/* Pinned */}
                                    <MetaRow icon={Pin} label="Pinned">
                                        <Switch
                                            checked={task.isPinned}
                                            onCheckedChange={() => handlePinToggle()}
                                            aria-label={task.isPinned ? "Unpin task" : "Pin task"}
                                        />
                                    </MetaRow>

                                    {/* Recurrence */}
                                    {task.recurrenceRule && recurrenceSummary && (
                                        <MetaRow icon={Repeat} label="Recurrence">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="rounded-xl bg-moonlit/10 px-2.5 py-1 text-xs text-moonlit">
                                                    {recurrenceSummary.cadenceLabel}
                                                </span>
                                                {recurrenceSummary.detailLabel && (
                                                    <span className="text-xs text-twilight-text-muted">
                                                        {recurrenceSummary.detailLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </MetaRow>
                                    )}
                                </div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>

                        {/* ── Subtasks pane ── */}
                        {activePanel !== "subtasks" ? (
                            <button
                                type="button"
                                onClick={() => setActivePanel("subtasks")}
                                className={stackedPanelTriggerClass}
                            >
                                <div>
                                    <p className="text-sm font-medium text-twilight-text">Subtasks</p>
                                    <p className="text-xs text-twilight-text-muted">{subtaskSummary}</p>
                                </div>
                                <Plus size={14} className="text-twilight-text-muted" aria-hidden="true" />
                            </button>
                        ) : null}

                        <AnimatePresence initial={false}>
                            {activePanel === "subtasks" ? (
                                <motion.div
                                    key="subtasks-panel"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                    className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.02] px-4 py-3"
                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-twilight-text">Subtasks</p>
                                            <p className="text-xs text-twilight-text-muted">{subtaskSummary}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setActivePanel("notes")}
                                            className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-lantern transition-colors hover:text-lantern/80"
                                        >
                                            Back to notes
                                        </button>
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                                        <SubtaskList taskId={task.id} />
                                    </div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>
                </ImmersiveDetailLayout>
            )}
        </motion.div>
    );
}
