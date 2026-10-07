import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
    Calendar, Bell, Tag, FolderOpen,
    Pin, Repeat, CalendarRange, Trash2, SlidersHorizontal,
    CircleDot, EyeOff, Clock, Columns3,
    ListChecks, StickyNote
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTask } from "../../hooks/tasks/use-tasks";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useArchiveTask } from "../../hooks/tasks/use-archive-task";
import { useProjects } from "../../hooks/projects/use-projects";
import { useSections } from "../../hooks/sections/use-sections";
import { useDebouncedCallback } from "../../hooks/core/use-debounced-callback";
import { useSubtasks } from "../../hooks/tasks/use-subtasks";
import { useTaskNote } from "../../hooks/tasks/use-task-note";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { TagField } from "./TagField";
import { useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags/use-task-tags";
import { SubtaskList } from "./SubtaskList";
import { TaskCheckbox } from "./TaskCheckbox";
import { TimetableBlockEditor } from "./TimetableBlockEditor";
import { RepeatKindPicker } from "../shared/RepeatKindPicker";
import { getTaskRepeatKind, useConvertRepeat } from "../../hooks/habits/use-convert-repeat";
import { DatePicker } from "../shared/DatePicker";
import { Button } from "../primitives/Button";
import { Skeleton } from "../primitives/Skeleton";
import { Switch } from "../primitives/Switch";
import { formatShortDate, formatShortDateTime, fromTimeValue } from "../../lib/utils/date-format";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, EFFORT_ICON, EFFORT_OPTIONS, PRIORITY_ICON, PRIORITY_OPTIONS } from "./task-choice-options";
import {
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    isPassiveTimetableTask,
    isRecurringTask,
} from "../../lib/utils/task/task-scheduling";
import type { EffortLevel, TaskPriority, TaskState } from "@cadence/contracts/task";
import type { ScheduleUpdates } from "./QuickScheduleSurface";
import { DetailTitle } from "../shared/DetailTitle";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import {
    CARD, PANEL_TRIGGER, PanelTrigger, PanelHeader, DetailGroup, FieldBlock, FieldRow, ValueSelect, VALUE_BTN,
} from "../shared/DetailPanelSections";

const TaskNoteInline = lazy(() => import("./TaskNoteInline").then((m) => ({ default: m.TaskNoteInline })));

interface TaskEditorProps {
    taskId: string;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}

/** A date from an instant (created, updated, a check-in), in the user's zone. */
function formatDateTime(iso: string) {
    return formatShortDate(iso);
}

/** Full task editing panel — notes-first design; metadata revealed on demand */
export function TaskEditor({
    taskId,
    onClose,
    detailMode = "peek",
    onDetailModeChange,
}: TaskEditorProps) {
    const task = useTask(taskId);
    // Below the wide layout this panel is a modal overlay (everything behind it is inert): it steps aside so the room above it is usable.
    const { isWide } = useShellMode();
    const { data: projects } = useProjects();
    const updateTask = useUpdateTask();
    const convertRepeat = useConvertRepeat();
    const archiveTask = useArchiveTask();
    const addTagAssoc = useAddTaskTag();
    const removeTagAssoc = useRemoveTaskTag();

    const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? "");
    const [activePanel, setActivePanel] = useState<"notes" | "subtasks" | "details">("notes");
    const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
    const { data: subtasks = [] } = useSubtasks(taskId);

    // The note is one session shared with the writing room; the summary reads from it.
    const { state: noteState } = useTaskNote(taskId);
    const notes = noteState?.body ?? "";

    // Sync waitingOn when task loads
    useEffect(() => {
        if (task) {
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
                titleTextareaRef.current?.focus();
                titleTextareaRef.current?.select();
            }
        };
        window.addEventListener("cadence:focus-task-title", handleFocusTitle);
        return () => window.removeEventListener("cadence:focus-task-title", handleFocusTitle);
    }, [taskId]);

    const debouncedSaveWaitingOn = useDebouncedCallback((content: string) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, waitingOn: content || null });
    }, 800);

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
        const next = task.effort === level ? null : level;
        updateTask.mutate({ id: task.id, effort: next, ...(next && { effortOrigin: "manual" as const }) });
    };

    const handlePinToggle = () => {
        if (!task) return;
        updateTask.mutate({ id: task.id, isPinned: !task.isPinned });
    };

    const handleDeadlineChange = (updates: ScheduleUpdates) => {
        if (!task) return;
        updateTask.mutate({ id: task.id, ...updates });
    };

    const handleDelete = () => {
        if (!task) return;
        archiveTask.mutate(task.id);
        onClose();
    };

    const { data: sections = [] } = useSections(task?.projectId ?? null);

    const scheduleSummary = task ? getTaskScheduleSummary(task) : null;
    const recurrenceSummary = task ? getTaskRecurrenceSummary(task) : null;
    const isPassiveTimetable = task ? isPassiveTimetableTask(task) : false;
    const canToggleInteractionMode = Boolean(task?.recurrenceRule && task?.scheduledStart);
    // Timetable blocks get direct start/end/day editing instead of the date popover alone.
    const isTimetableBlock = isPassiveTimetable && canToggleInteractionMode;
    const scheduleLabel = recurrenceSummary?.label ?? scheduleSummary?.primaryLabel ?? "No schedule";
    const scheduleFieldLabel = task && isRecurringTask(task)
        ? "Series"
        : scheduleSummary?.isDuration
            ? "Duration"
            : scheduleSummary?.isTimed
                ? (isPassiveTimetable ? "Fixed time" : "Time block")
                : "Deadline";

    const completedSubtasks = subtasks.filter((subtask) => subtask.isComplete).length;
    const subtaskSummary = subtasks.length
        ? `${completedSubtasks}/${subtasks.length} complete`
        : "No subtasks yet";
    const noteSummary = notes.trim() ? `${notes.trim().split(/\s+/).length.toLocaleString()} words` : "Tap to write notes";
    const stateLabel = task?.state === "WAITING" ? "Waiting" : task?.state === "COMPLETE" ? "Complete" : isPassiveTimetable ? "Fixed" : "Active";
    const detailsSummary = [
        stateLabel,
        scheduleSummary ? scheduleLabel : null,
        task && task.priority > 0 ? `${PRIORITY_CONFIG[task.priority].label} priority` : null,
    ].filter(Boolean).join(" · ");

    return (
        <div
            className="h-full min-w-0 overflow-hidden"
            role="complementary"
            aria-label="Task details"
        >
            {!task ? (
                <div className="flex h-full flex-col">
                    <div className="flex items-center gap-3 border-b border-twilight-border px-5 h-(--shell-header-h) shrink-0">
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
                <DetailPanelLayout
                    mode={detailMode}
                    onModeChange={onDetailModeChange}
                    onClose={onClose}
                    closeLabel="Close task details"
                    title={isPassiveTimetable ? "Fixed" : "Task"}
                    leading={<TaskCheckbox task={task} compact />}
                >
                        <DetailTitle value={task.title} label="Task title" textareaRef={titleTextareaRef}
                            onSave={(title) => updateTask.mutate({ id: task.id, title })} />

                        {/* ── Notes pane ── */}
                        {activePanel !== "notes" ? (
                            <PanelTrigger icon={StickyNote} title="Notes" summary={noteSummary} onOpen={() => setActivePanel("notes")} />
                        ) : null}

                        <AnimatePresence initial={false}>
                            {activePanel === "notes" ? (
                                <motion.div
                                    key="notes-panel"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                                    className="flex shrink-0 flex-col gap-3"
                                >
                                    <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
                                        <TaskNoteInline taskId={task.id} onOpenRoom={isWide ? undefined : onClose} />
                                    </Suspense>
                                    <p className="px-1 text-[13px] leading-relaxed text-twilight-text-muted" aria-label="Task metadata">
                                        Created {formatDateTime(task.createdAt)}
                                        {task.updatedAt !== task.createdAt && <> · Updated {formatDateTime(task.updatedAt)}</>}
                                    </p>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>

                        {/* ── Details pane ── */}
                        {activePanel !== "details" ? (
                            <PanelTrigger icon={SlidersHorizontal} title="Details" summary={detailsSummary} onOpen={() => setActivePanel("details")} />
                        ) : null}

                        <AnimatePresence initial={false}>
                            {activePanel === "details" ? (
                                <motion.div
                                    key="details-panel"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                        height: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
                                        opacity: { duration: 0.2 },
                                    }}
                                    className={`${CARD} flex shrink-0 flex-col overflow-hidden`}
                                >
                                    <div className="px-4 pb-1 pt-3">
                                        <PanelHeader title="Details" onDone={() => setActivePanel("notes")} />
                                    </div>

                                    <DetailGroup title="Status">
                                        <FieldBlock icon={CircleDot} label="State">
                                            <div className="grid grid-cols-3 gap-1.5">
                                                <button
                                                    type="button"
                                                    aria-pressed={task.state === "ACTIVE"}
                                                    onClick={() => handleStateChange("ACTIVE")}
                                                    className={`${CHIP_BASE} ${task.state === "ACTIVE" ? CHIP_ACTIVE : CHIP_IDLE}`}
                                                >
                                                    Active
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={task.state === "WAITING"}
                                                    onClick={() => handleStateChange("WAITING")}
                                                    className={`${CHIP_BASE} ${task.state === "WAITING" ? "border-moonlit/30 bg-moonlit/15 text-moonlit" : CHIP_IDLE}`}
                                                >
                                                    Waiting
                                                </button>
                                                {!isPassiveTimetable ? (
                                                    <button
                                                        type="button"
                                                        aria-pressed={task.state === "COMPLETE"}
                                                        onClick={() => handleStateChange("COMPLETE")}
                                                        className={`${CHIP_BASE} ${task.state === "COMPLETE" ? "border-feedback-success/30 bg-feedback-success/15 text-feedback-success" : CHIP_IDLE}`}
                                                    >
                                                        Complete
                                                    </button>
                                                ) : (
                                                    <span className={`${CHIP_BASE} cursor-default border-moonlit/20 text-moonlit`}>
                                                        Anchor
                                                    </span>
                                                )}
                                            </div>
                                        </FieldBlock>

                                        <AnimatePresence>
                                            {task.state === "WAITING" && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="mt-1 flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2">
                                                        <div data-focus-container className="flex min-h-10 items-center gap-2">
                                                            <Clock size={14} className="shrink-0 text-twilight-text-muted opacity-70" aria-hidden="true" />
                                                            <input
                                                                type="text"
                                                                value={waitingOn}
                                                                onChange={handleWaitingOnChange}
                                                                aria-label="Waiting on"
                                                                placeholder="Waiting on who or what?"
                                                                className="min-w-0 flex-1 bg-transparent text-[13px] text-twilight-text-soft outline-none placeholder:text-twilight-text-muted/60"
                                                            />
                                                        </div>
                                                        <div className="flex min-h-10 items-center gap-2">
                                                            <Bell size={14} className="shrink-0 text-twilight-text-muted opacity-70" aria-hidden="true" />
                                                            <DeadlinePickerPopover
                                                                dueDate={null}
                                                                scheduledStart={task.waitingReminder ?? null}
                                                                recurrenceRule={null}
                                                                onChange={(updates) => updateTask.mutate({ id: task.id, waitingReminder: updates.scheduledStart ?? (updates.dueDate ? fromTimeValue(updates.dueDate, "09:00") : null) })}
                                                            >
                                                                <button type="button" className={`${VALUE_BTN} -ml-2.5`}>
                                                                    {task.waitingReminder ? `Check again ${formatDateTime(task.waitingReminder)}` : "Set a check-in reminder"}
                                                                </button>
                                                            </DeadlinePickerPopover>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {isRecurringTask(task) && (
                                            <div className="py-1.5">
                                                <RepeatKindPicker
                                                    value={getTaskRepeatKind(task)}
                                                    disabled={convertRepeat.isPending}
                                                    fixedUnavailableReason={canToggleInteractionMode ? null : "Give it a start and end time to make it fixed."}
                                                    onChange={(kind) => {
                                                        if (kind === "routine") {
                                                            void convertRepeat.taskToRoutine(task).then(onClose);
                                                            return;
                                                        }
                                                        updateTask.mutate({
                                                            id: task.id,
                                                            interactionMode: kind === "fixed" ? "timetable" : "task",
                                                            ...(kind === "fixed" && task.state === "COMPLETE" ? { state: "ACTIVE" as const } : {}),
                                                        });
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </DetailGroup>

                                    <DetailGroup title="When">
                                        {isTimetableBlock ? (
                                            <FieldRow icon={Calendar} label="Series">
                                                <span className="truncate px-2.5 text-right text-[13px] text-moonlit">
                                                    {scheduleLabel}
                                                </span>
                                            </FieldRow>
                                        ) : (
                                            <FieldRow icon={scheduleSummary?.isDuration ? CalendarRange : Calendar} label={scheduleFieldLabel}>
                                                <DeadlinePickerPopover
                                                    dueDate={task.dueDate}
                                                    endDate={task.endDate}
                                                    scheduledStart={task.scheduledStart}
                                                    scheduledEnd={task.scheduledEnd}
                                                    recurrenceRule={task.recurrenceRule}
                                                    onChange={handleDeadlineChange}
                                                >
                                                    <button type="button" className={VALUE_BTN}>
                                                        <span className="truncate">{scheduleLabel}</span>
                                                    </button>
                                                </DeadlinePickerPopover>
                                            </FieldRow>
                                        )}

                                        {isTimetableBlock ? (
                                            <FieldBlock icon={Clock} label="Time block">
                                                <TimetableBlockEditor task={task} />
                                            </FieldBlock>
                                        ) : task.recurrenceRule && recurrenceSummary?.detailLabel ? (
                                            <FieldRow icon={Repeat} label="Repeats">
                                                <span className="truncate px-2.5 text-right text-[13px] text-moonlit">
                                                    {recurrenceSummary.detailLabel}
                                                </span>
                                            </FieldRow>
                                        ) : null}

                                        {!isTimetableBlock ? (
                                            <FieldRow icon={EyeOff} label="Hide until">
                                                <DatePicker
                                                    value={task.notBefore ?? null}
                                                    onChange={(date) => {
                                                        if (!task) return;
                                                        updateTask.mutate({ id: task.id, notBefore: date });
                                                    }}
                                                    label="Hide until date"
                                                    clearLabel="Always show"
                                                >
                                                    <button type="button" className={`${VALUE_BTN} ${task.notBefore ? "" : "text-twilight-text-muted"}`}>
                                                        {task.notBefore ? formatShortDate(task.notBefore) : "Always shown"}
                                                    </button>
                                                </DatePicker>
                                            </FieldRow>
                                        ) : null}

                                        <FieldRow icon={Bell} label="Reminder" hint={task.reminderAt ? formatShortDateTime(task.reminderAt) : undefined}>
                                            <Switch
                                                checked={Boolean(task.reminderAt)}
                                                onCheckedChange={(on) => updateTask.mutate({ id: task.id, reminderAt: on ? new Date().toISOString() : null, reminderSilenced: false })}
                                                aria-label={task.reminderAt ? "Remove reminder" : "Set reminder"}
                                            />
                                        </FieldRow>
                                    </DetailGroup>

                                    <DetailGroup title="Weight">
                                        <FieldBlock icon={PRIORITY_ICON} label="Priority">
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {PRIORITY_OPTIONS.map((item) => {
                                                    const Icon = item.icon;
                                                    const active = task.priority === item.value;
                                                    return (
                                                        <button
                                                            key={item.value}
                                                            type="button"
                                                            aria-label={`Priority: ${item.label}`}
                                                            aria-pressed={active}
                                                            onClick={() => handlePriorityChange(item.value)}
                                                            className={`${CHIP_BASE} min-h-12 flex-col gap-0.5 px-1 ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                                                        >
                                                            <Icon size={14} aria-hidden="true" />
                                                            <span className="text-[10px] leading-none">{item.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </FieldBlock>

                                        <FieldBlock icon={EFFORT_ICON} label="Effort">
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {EFFORT_OPTIONS.map((item) => {
                                                    const Icon = item.icon;
                                                    const active = task.effort === item.value;
                                                    return (
                                                        <button
                                                            key={item.value}
                                                            type="button"
                                                            aria-label={`Effort: ${item.label}`}
                                                            aria-pressed={active}
                                                            onClick={() => handleEffortChange(item.value)}
                                                            className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                                                        >
                                                            <Icon size={14} aria-hidden="true" />
                                                            {item.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </FieldBlock>
                                    </DetailGroup>

                                    <DetailGroup title="Organize">
                                        <FieldRow icon={FolderOpen} label="List">
                                            <ValueSelect
                                                label="List"
                                                value={task.projectId ?? ""}
                                                onChange={(id) => updateTask.mutate({ id: task.id, projectId: id || null, sectionId: null })}
                                                options={[{ value: "", label: "None" }, ...(projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
                                            />
                                        </FieldRow>

                                        {sections.length > 0 ? (
                                            <FieldRow icon={Columns3} label="Section">
                                                <ValueSelect
                                                    label="Section"
                                                    value={task.sectionId ?? ""}
                                                    onChange={(id) => updateTask.mutate({ id: task.id, sectionId: id || null })}
                                                    options={[{ value: "", label: "Unsectioned" }, ...sections.map((x) => ({ value: x.id, label: x.name }))]}
                                                />
                                            </FieldRow>
                                        ) : null}

                                        <FieldBlock icon={Tag} label="Tags">
                                            <TagField
                                                tagIds={task.tagIds ?? []}
                                                onAdd={(id) => addTagAssoc.mutate({ taskId: task.id, tagId: id })}
                                                onRemove={(id) => removeTagAssoc.mutate({ taskId: task.id, tagId: id })}
                                            />
                                        </FieldBlock>

                                        <FieldRow icon={Pin} label="Pin to top">
                                            <Switch
                                                checked={task.isPinned}
                                                onCheckedChange={() => handlePinToggle()}
                                                aria-label={task.isPinned ? "Unpin task" : "Pin task"}
                                            />
                                        </FieldRow>
                                    </DetailGroup>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>

                        {/* ── Subtasks pane ── */}
                        {activePanel !== "subtasks" ? (
                            <PanelTrigger icon={ListChecks} title="Subtasks" summary={subtaskSummary} onOpen={() => setActivePanel("subtasks")} />
                        ) : null}

                        <AnimatePresence initial={false}>
                            {activePanel === "subtasks" ? (
                                <motion.div
                                    key="subtasks-panel"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                                    className={`${CARD} flex min-h-64 flex-1 flex-col overflow-hidden px-4 py-3`}
                                >
                                    <div className="mb-2">
                                        <PanelHeader title="Subtasks" summary={subtaskSummary} onDone={() => setActivePanel("notes")} />
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                                        <SubtaskList taskId={task.id} />
                                    </div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>

                        <Button variant="ghost" size="none"
                            type="button"
                            onClick={handleDelete}
                            disabled={archiveTask.isPending}
                            className={`${PANEL_TRIGGER} shrink-0 font-normal text-feedback-error disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10">
                                <Trash2 size={16} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                    {task.recurrenceRule ? "Move series to Trash" : "Move to Trash"}
                                </span>
                                <span className="block text-xs text-twilight-text-muted">
                                    {task.recurrenceRule ? "Removes every occurrence. Restore from Trash." : "You can restore this task from Trash."}
                                </span>
                            </span>
                        </Button>
                </DetailPanelLayout>
            )}
        </div>
    );
}
