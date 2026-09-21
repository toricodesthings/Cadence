import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import {
    Calendar, Bell, Tag, FolderOpen, Flag,
    Pin, Repeat, CalendarRange, Trash2, SlidersHorizontal,
    CircleDot, Gauge, EyeOff, Clock, Plus, Columns3,
    ExternalLink, Check, ListChecks, StickyNote
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTasks, useUpdateTask, useArchiveTask, useCreateSubtask } from "../../hooks/tasks";
import { useProjects } from "../../hooks/projects";
import { useSections } from "../../hooks/sections";
import { useDebouncedCallback } from "../../hooks/core/use-debounced-callback";
import { useSubtasks } from "../../hooks/tasks/use-subtasks";
import { useTaskNote } from "../../hooks/tasks/use-task-note";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { TagPickerList } from "./TagPickerSubmenu";
import { TagBubble } from "../sidebar/TagBubble";
import { useTags, useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags";
import { SubtaskList } from "./SubtaskList";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskNoteSaveStatus } from "./TaskNoteSaveStatus";
import { TimetableBlockEditor } from "./TimetableBlockEditor";
import { RepeatKindPicker } from "../shared/RepeatKindPicker";
import { getTaskRepeatKind, useConvertRepeat } from "../../hooks/habits/use-convert-repeat";
import { DateOnlyPickerPopover } from "./DateOnlyPickerPopover";
import { getNoteScopeLabel, isSeriesScopedNote } from "../../lib/notes/recurring-note-scope";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { Skeleton } from "../primitives/Skeleton";
import { Switch } from "../primitives/Switch";
import { formatShortDate, formatShortDateTime, parseLocalDate, toISODate } from "../../lib/utils/date-format";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, EFFORT_OPTIONS, FIELD_LABEL, PRIORITY_OPTIONS } from "./task-choice-options";
import {
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    isPassiveTimetableTask,
    isRecurringTask,
} from "../../lib/utils/task/task-scheduling";
import type { EffortLevel, TaskPriority, TaskState } from "@cadence/contracts/task";
import { DetailTitle } from "../shared/DetailTitle";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { CARD, PANEL_TRIGGER, PanelTrigger, PanelHeader } from "../shared/DetailPanelSections";
import { useNoteRoomStore } from "../../stores/note-room-store";

const MarkdownEditor = lazy(() => import("./MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })));

interface TaskEditorProps {
    taskId: string;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}

function formatDateTime(iso: string) {
    return formatShortDate(iso);
}

/** Native select dressed as a value button — the OS picker is the mobile-friendly one. */
const VALUE_SELECT = "min-h-10 max-w-full cursor-pointer appearance-none truncate rounded-lg bg-transparent px-2.5 text-right text-[13px] text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

const VALUE_BTN = "flex min-h-10 max-w-full cursor-pointer items-center rounded-lg px-2.5 text-right text-[13px] text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/** Titled cluster of related fields inside Details. */
function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-1 border-t border-twilight-border/25 px-4 py-4" aria-label={title}>
            <p className={`${FIELD_LABEL} mb-1`}>{title}</p>
            {children}
        </section>
    );
}

/** Label above a full-width control — for choice rows that need the width. */
function FieldBlock({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2 py-1.5" role="group" aria-label={label}>
            <span className="flex items-center gap-2 text-[13px] text-twilight-text-muted">
                <Icon size={14} className="shrink-0 opacity-80" aria-hidden="true" />
                {label}
            </span>
            {children}
        </div>
    );
}

/** Label left, value right — for single-value rows. */
function FieldRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-11 items-center justify-between gap-3" role="group" aria-label={label}>
            <span className="flex shrink-0 items-center gap-2 text-[13px] text-twilight-text-muted">
                <Icon size={14} className="shrink-0 opacity-80" aria-hidden="true" />
                {label}
            </span>
            <div className="flex min-w-0 flex-1 justify-end">{children}</div>
        </div>
    );
}

/** Full task editing panel — notes-first design; metadata revealed on demand */
export function TaskEditor({
    taskId,
    onClose,
    detailMode = "peek",
    onDetailModeChange,
}: TaskEditorProps) {
    const { data: activeTasks } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks } = useTasks({ state: "WAITING" });
    const { data: archiveTasks } = useTasks({ state: "ARCHIVED" });
    const { data: doneTasks } = useTasks({ state: "COMPLETE" });
    const { data: projects } = useProjects();
    const updateTask = useUpdateTask();
    const convertRepeat = useConvertRepeat();
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

    const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? "");
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [activePanel, setActivePanel] = useState<"notes" | "subtasks" | "details">("notes");
    const [showConvertedCheck, setShowConvertedCheck] = useState(false);
    const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
    const { data: subtasks = [] } = useSubtasks(taskId);

    // Unified note state — shared between inline editor and Writing Room
    const { draft: notes, onChange: onNotesChange, saveStatus } = useTaskNote(taskId);

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

    const existingSubtaskTitles = useMemo(() => {
        return new Set(subtasks.map(st => st.title.trim().toLowerCase()));
    }, [subtasks]);

    const convertibleNoteLines = useMemo(
        () =>
            notes
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => /^(-|\*|\d+\.)\s+/.test(line))
                .map((line) => line.replace(/^(-|\*|\d+\.)\s+/, "").trim())
                .filter(Boolean)
                .filter((line) => !existingSubtaskTitles.has(line.toLowerCase())),
        [notes, existingSubtaskTitles],
    );

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
        // Guard the wire payload: dueDate must be a valid date-only or ISO datetime,
        // or null. Anything else (empty string, whitespace, unparseable) would trip
        // the backend's date union and 400. Coerce unparseable values to null.
        const dueDate = (() => {
            const raw = updates.dueDate;
            if (!raw || !raw.trim()) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
            const ms = new Date(raw).getTime();
            return Number.isNaN(ms) ? null : raw;
        })();
        updateTask.mutate({
            id: task.id,
            dueDate,
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
    const { data: sections = [] } = useSections(task?.projectId ?? null);

    const scheduleSummary = task ? getTaskScheduleSummary(task) : null;
    const recurrenceSummary = task ? getTaskRecurrenceSummary(task) : null;
    const isPassiveTimetable = task ? isPassiveTimetableTask(task) : false;
    const canToggleInteractionMode = Boolean(task?.recurrenceRule && task?.scheduledStart && task?.isAllDay === false);
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

    const charCount = notes.length;
    const maxChars = 50000;
    const completedSubtasks = subtasks.filter((subtask) => subtask.isComplete).length;
    const subtaskSummary = subtasks.length
        ? `${completedSubtasks}/${subtasks.length} complete`
        : "No subtasks yet";
    const noteSummary = notes.trim() ? `${charCount.toLocaleString()} chars` : "Tap to write notes";
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
                                        <MarkdownEditor
                                            notes={notes}
                                            isEditing={isEditingNotes}
                                            setIsEditing={setIsEditingNotes}
                                            onNotesChange={onNotesChange}
                                            maxLength={maxChars}
                                        />
                                    </Suspense>

                                    {(convertibleNoteLines.length > 0 || showConvertedCheck) && (
                                        <button
                                            type="button"
                                            disabled={showConvertedCheck}
                                            onClick={() => {
                                                if (convertibleNoteLines.length === 0) return;
                                                const baseOrder = Date.now();
                                                convertibleNoteLines.forEach((line, index) => {
                                                    createSubtask.mutate({ title: line, orderIndex: baseOrder + index });
                                                });
                                                setShowConvertedCheck(true);
                                                setTimeout(() => setShowConvertedCheck(false), 2000);
                                            }}
                                            className={`flex min-h-10 items-center justify-center gap-2 rounded-[1.15rem] px-4 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                                showConvertedCheck
                                                    ? "bg-feedback-success/15 text-feedback-success"
                                                    : "cursor-pointer bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/15"
                                            }`}
                                        >
                                            {showConvertedCheck ? (
                                                <>
                                                    <Check size={14} aria-hidden="true" />
                                                    Added to subtasks
                                                </>
                                            ) : (
                                                <>
                                                    <ListChecks size={14} aria-hidden="true" />
                                                    Turn {convertibleNoteLines.length} bullet{convertibleNoteLines.length === 1 ? "" : "s"} into subtasks
                                                </>
                                            )}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => openNoteRoom(task.id, task.title)}
                                        className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[1.15rem] border border-twilight-border/35 bg-white/[0.025] px-4 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                                    >
                                        <ExternalLink size={14} aria-hidden="true" />
                                        Open writing room
                                    </button>

                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <p className="text-[11px] leading-relaxed text-twilight-text-muted/90" aria-label="Task metadata">
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
                                            {/* Counter only surfaces near the limit — no running tally to watch. */}
                                            {charCount > maxChars * 0.8 && (
                                                <span
                                                    className="text-[11px] tabular-nums text-accent-primary"
                                                    aria-live="polite"
                                                    aria-label={`${charCount} of ${maxChars} characters used`}
                                                >
                                                    {charCount.toLocaleString()} / {maxChars.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
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
                                                                onChange={(updates) => updateTask.mutate({ id: task.id, waitingReminder: updates.scheduledStart ?? null })}
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
                                                <DateOnlyPickerPopover
                                                    value={task.notBefore ? toISODate(new Date(task.notBefore)) : null}
                                                    onChange={(date) => {
                                                        if (!task) return;
                                                        const at = date ? parseLocalDate(date) : null;
                                                        at?.setHours(0, 0, 0, 0);
                                                        updateTask.mutate({ id: task.id, notBefore: at ? at.toISOString() : null });
                                                    }}
                                                    label="Hide until date"
                                                    clearLabel="Always show"
                                                >
                                                    <button type="button" className={`${VALUE_BTN}${task.notBefore ? "" : "text-twilight-text-muted"}`}>
                                                        {task.notBefore ? formatShortDate(task.notBefore) : "Always shown"}
                                                    </button>
                                                </DateOnlyPickerPopover>
                                            </FieldRow>
                                        ) : null}

                                        <FieldRow icon={Bell} label="Reminder">
                                            {task.reminderAt ? (
                                                <span className="truncate px-2.5 text-[13px] text-twilight-text-soft">
                                                    {formatShortDateTime(task.reminderAt)}
                                                </span>
                                            ) : null}
                                            <Switch
                                                checked={Boolean(task.reminderAt)}
                                                onCheckedChange={(on) => updateTask.mutate({ id: task.id, reminderAt: on ? new Date().toISOString() : null, reminderSilenced: false })}
                                                aria-label={task.reminderAt ? "Remove reminder" : "Set reminder"}
                                            />
                                        </FieldRow>
                                    </DetailGroup>

                                    <DetailGroup title="Weight">
                                        <FieldBlock icon={Flag} label="Priority">
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

                                        <FieldBlock icon={Gauge} label="Effort">
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
                                        <FieldRow icon={FolderOpen} label="Project">
                                            <select
                                                aria-label="Project"
                                                value={task.projectId ?? ""}
                                                onChange={(e) => updateTask.mutate({ id: task.id, projectId: e.target.value || null, sectionId: null })}
                                                className={`${VALUE_SELECT} ${project ? "" : "text-twilight-text-muted"}`}
                                            >
                                                <option value="">None</option>
                                                {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </FieldRow>

                                        {sections.length > 0 ? (
                                            <FieldRow icon={Columns3} label="Section">
                                                <select
                                                    aria-label="Section"
                                                    value={task.sectionId ?? ""}
                                                    onChange={(e) => updateTask.mutate({ id: task.id, sectionId: e.target.value || null })}
                                                    className={VALUE_SELECT}
                                                >
                                                    <option value="">Unsectioned</option>
                                                    {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                                                </select>
                                            </FieldRow>
                                        ) : null}

                                        <FieldBlock icon={Tag} label="Tags">
                                            <div className="flex flex-wrap items-center gap-1.5">
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
                                                        <Button variant="ghost" size="sm" className="min-h-9 cursor-pointer rounded-full border border-dashed border-twilight-border px-3 text-[12px]">
                                                            <Plus size={12} aria-hidden="true" />
                                                            Add tag
                                                        </Button>
                                                    </DropdownMenu.Trigger>
                                                    <DropdownMenu.Content align="start" className="w-56 p-2">
                                                        <TagPickerList
                                                            activeTagIds={task.tagIds ?? []}
                                                            onAdd={(id) => addTagAssoc.mutate({ taskId: task.id, tagId: id })}
                                                            onRemove={(id) => removeTagAssoc.mutate({ taskId: task.id, tagId: id })}
                                                            MenuComponents={DropdownMenu}
                                                        />
                                                    </DropdownMenu.Content>
                                                </DropdownMenu.Root>
                                            </div>
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
