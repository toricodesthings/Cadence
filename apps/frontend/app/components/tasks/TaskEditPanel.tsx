import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import {
    ArrowLeft, MoreHorizontal, Calendar, Bell, Tag, FolderOpen, Zap,
    Pin, Repeat, CalendarRange, AlertTriangle, Trash2, Copy, SlidersHorizontal,
    CircleDot, Gauge, CalendarOff, Clock, Plus, Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTasks, useUpdateTask, useDeleteTask } from "../../hooks/tasks";
import { useProjects } from "../../hooks/projects";
import { useDebouncedCallback } from "../../hooks/core/use-debounced-callback";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { PriorityPicker } from "./PriorityPicker";
import { TagPickerList } from "./TagPickerSubmenu";
import { TagBubble } from "../sidebar/TagBubble";
import { useTags, useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags";
import { SubtaskList } from "./SubtaskList";
import * as Separator from "../primitives/Separator";
import * as Tooltip from "../primitives/Tooltip";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { formatShortDate, formatShortDateTime } from "../../lib/utils/date-format";
import { PRIORITY_CONFIG } from "../../lib/utils/priority";
import {
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    isPassiveTimetableTask,
    isRecurringTask,
} from "../../lib/utils/task-scheduling";
import type { Task, TaskPriority, TaskState, EffortLevel } from "../../types/task";

const MarkdownEditor = lazy(() => import("./MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })));

interface TaskEditPanelProps {
    taskId: string;
    onClose: () => void;
}

function formatDateTime(iso: string) {
    return formatShortDate(iso);
}

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
        <div className="flex items-center gap-3 py-3 px-5 border-b border-twilight-border/40" role="group" aria-label={label}>
            <Icon
                size={15}
                className="shrink-0 text-twilight-text-muted"
                aria-hidden="true"
            />
            <span className="text-[13px] text-twilight-text-muted w-20 shrink-0">{label}</span>
            <div className="flex-1 flex justify-end min-w-0"><div className="max-w-full overflow-x-auto scrollbar-hidden flex justify-end">{children}</div></div>
        </div>
    );
});

/** Full task editing panel — notes-first design; metadata revealed on demand */
export function TaskEditPanel({ taskId, onClose }: TaskEditPanelProps) {
    const { data: activeTasks } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks } = useTasks({ state: "WAITING" });
    const { data: archiveTasks } = useTasks({ state: "ARCHIVED" });
    const { data: doneTasks } = useTasks({ state: "COMPLETE" });
    const { data: projects } = useProjects();
    const updateTask = useUpdateTask();
    const deleteTask = useDeleteTask();
    const { data: tags } = useTags();
    const addTagAssoc = useAddTaskTag();
    const removeTagAssoc = useRemoveTaskTag();

    // Find the task across all caches
    const task = useMemo(
        () => [...(activeTasks ?? []), ...(waitingTasks ?? []), ...(archiveTasks ?? []), ...(doneTasks ?? [])].find(
            (t) => t.id === taskId
        ),
        [activeTasks, waitingTasks, archiveTasks, doneTasks, taskId],
    );

    const [title, setTitle] = useState(task?.title ?? "");
    const [notes, setNotes] = useState(task?.content ?? "");
    const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? "");
    const [showDetails, setShowDetails] = useState(false);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);
    const notesRef = useRef<HTMLTextAreaElement>(null);

    // Sync state when task loads
    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setNotes(task.content ?? "");
            setWaitingOn(task.waitingOn ?? "");
        }
    }, [task]);

    const debouncedSaveNotes = useDebouncedCallback((content: string) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, content });
    }, 800);

    const debouncedSaveWaitingOn = useDebouncedCallback((content: string) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, waitingOn: content || null });
    }, 800);

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

    const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNotes(e.target.value);
        debouncedSaveNotes(e.target.value);
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
        deleteTask.mutate(task.id);
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
    const maxChars = 10000;

    return (
        <motion.div
            className="h-full flex flex-col bg-twilight-deep overflow-hidden"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            role="complementary"
            aria-label="Task details"
        >
            {!task ? (
                <div className="flex-1 flex items-center justify-center text-twilight-text-muted text-sm">
                    <p>Loading task…</p>
                </div>
            ) : (
                <>
                    {/* Header — compact: back | title | settings toggle | menu */}
                    <div className="flex items-center gap-3 px-5 h-14 border-b border-twilight-border shrink-0">
                        <button
                            onClick={onClose}
                            aria-label="Close task details"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0"
                        >
                            <ArrowLeft size={15} aria-hidden="true" />
                        </button>

                        <div className="flex-1 min-w-0 relative group flex items-center">
                            <input
                                ref={titleRef}
                                type="text"
                                value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            aria-label="Task title"
                            className="peer flex-1 min-w-0 bg-transparent font-display text-sm font-medium text-twilight-text outline-none placeholder:text-twilight-text-muted/80 truncate"
                            placeholder="Task title"
                            />
                            <div className="absolute right-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity text-twilight-text-muted peer-focus:opacity-0 flex items-center justify-center">
                                <Pencil size={13} aria-hidden="true" />
                            </div>
                        </div>

                        <button
                            onClick={() => setShowDetails((v) => !v)}
                            aria-label={showDetails ? "Hide task details" : "Show task details"}
                            aria-expanded={showDetails}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${showDetails
                                ? "text-lantern bg-lantern/10"
                                : "text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                }`}
                        >
                            <SlidersHorizontal size={14} aria-hidden="true" />
                        </button>

                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    aria-label="Task actions"
                                    aria-haspopup="menu"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0"
                                >
                                    <MoreHorizontal size={15} aria-hidden="true" />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end">
                                {task.recurrenceRule && (
                                    <DropdownMenu.Item onSelect={() => handleStateChange("ARCHIVED")}>
                                        <Calendar size={14} aria-hidden="true" />
                                        Archive series
                                    </DropdownMenu.Item>
                                )}
                                <DropdownMenu.Item
                                    className="flex items-center gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
                                    onSelect={handleDelete}
                                >
                                    <Trash2 size={14} aria-hidden="true" />
                                    {task.recurrenceRule ? "Delete series" : "Delete task"}
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    </div>

                    {/* Collapsible metadata — revealed when user clicks settings icon */}
                    <AnimatePresence initial={false}>
                        {showDetails && (
                            <motion.div
                                key="metadata"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                                className="overflow-hidden shrink-0 border-b border-twilight-border"
                            >
                                <div className="flex flex-col max-h-[45vh] overflow-y-auto scrollbar-thin">
                                    {/* State */}
                                    <MetaRow icon={CircleDot} label="State">
                                        <div className="flex bg-white/[0.04] p-0.5 rounded-xl gap-0.5">
                                            <button
                                                onClick={() => handleStateChange("ACTIVE")}
                                                className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.state === "ACTIVE" ? "bg-lantern/15 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Active
                                            </button>
                                            <button
                                                onClick={() => handleStateChange("WAITING")}
                                                className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.state === "WAITING" ? "bg-moonlit/15 text-moonlit shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Waiting
                                            </button>
                                            {!isPassiveTimetable ? (
                                                <button
                                                    onClick={() => handleStateChange("COMPLETE")}
                                                    className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.state === "COMPLETE" ? "bg-feedback-success/15 text-feedback-success shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
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
                                            <div className="flex bg-white/[0.04] p-0.5 rounded-xl gap-0.5">
                                                <button
                                                    onClick={() => updateTask.mutate({
                                                        id: task.id,
                                                        interactionMode: "timetable",
                                                        ...(task.state === "COMPLETE" ? { state: "ACTIVE" } : {}),
                                                    })}
                                                    className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                                                        task.interactionMode === "timetable"
                                                            ? "bg-moonlit/15 text-moonlit shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                                                            : "text-twilight-text-muted hover:text-twilight-text"
                                                    }`}
                                                >
                                                    Timetable anchor
                                                </button>
                                                <button
                                                    onClick={() => updateTask.mutate({ id: task.id, interactionMode: "task" })}
                                                    className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
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
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden bg-white/[0.02] border-b border-twilight-border/40"
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
                                            <Button variant="ghost" size="sm" className="text-[13px] text-twilight-text-soft hover:text-twilight-text p-0">
                                                {task.notBefore ? formatDateTime(task.notBefore) : "Not set"}
                                            </Button>
                                        </DeadlinePickerPopover>
                                    </MetaRow>

                                    {/* Effort */}
                                    <MetaRow icon={Gauge} label="Effort">
                                        <div className="flex bg-white/[0.04] p-0.5 rounded-xl gap-0.5">
                                            <button
                                                onClick={() => handleEffortChange(1)}
                                                className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.effort === 1 ? "bg-white/[0.08] text-twilight-text shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Low
                                            </button>
                                            <button
                                                onClick={() => handleEffortChange(2)}
                                                className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.effort === 2 ? "bg-lantern/15 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
                                            >
                                                Medium
                                            </button>
                                            <button
                                                onClick={() => handleEffortChange(3)}
                                                className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${task.effort === 3 ? "bg-lantern/30 text-lantern shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-twilight-text-muted hover:text-twilight-text"}`}
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
                                            <Button variant="ghost" size="sm" className="text-[13px] text-twilight-text-soft hover:text-twilight-text p-0">
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
                                                    <Button variant="ghost" size="sm" className="rounded-full px-2.5 py-1 text-[12px] border border-twilight-border border-dashed">
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
                                        <button
                                            onClick={handlePinToggle}
                                            aria-label={task.isPinned ? "Unpin task" : "Pin task"}
                                            aria-pressed={task.isPinned}
                                            className={`relative w-9 h-5 rounded-full transition-colors ${task.isPinned ? "bg-lantern/30" : "bg-white/[0.08]"
                                                }`}
                                        >
                                            <span
                                                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform bg-white  ${task.isPinned ? "translate-x-4" : "translate-x-0"
                                                    }`}
                                                aria-hidden="true"
                                            />
                                        </button>
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
                        )}
                    </AnimatePresence>

                    {/* Notes — fills all remaining space */}
                    <div className="flex-1 flex flex-col min-h-0 px-5 pt-5 pb-3">
                        <Suspense fallback={<div className="flex-1" />}>
                            <MarkdownEditor
                                notes={notes}
                                isEditing={isEditingNotes}
                                setIsEditing={setIsEditingNotes}
                                onChange={handleNotesChange}
                                maxLength={maxChars}
                            />
                        </Suspense>

                        {/* Subtasks stub to be implemented fully later */}
                        <SubtaskList taskId={task.id} />

                        <div className="flex items-center justify-between pt-2 shrink-0">
                            <p className="text-[10px] text-twilight-text-muted/90 leading-relaxed" aria-label="Task metadata">
                                Created {formatDateTime(task.createdAt)}
                                {task.updatedAt !== task.createdAt && (
                                    <> · Updated {formatDateTime(task.updatedAt)}</>
                                )}
                            </p>
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
                </>
            )}
        </motion.div>
    );
}
