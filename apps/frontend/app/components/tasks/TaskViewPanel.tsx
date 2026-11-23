import { useState, lazy, Suspense, type ElementType } from "react";
import {
    Calendar,
    CalendarRange,
    CheckCircle2,
    Columns3,
    EyeOff,
    Hourglass,
    ListChecks,
    Repeat,
    StickyNote,
    Tag,
    UserCheck,
} from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { formatMinutes } from "@cadence/domain/duration-chips";
import { useSections } from "../../hooks/sections/use-sections";
import { useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags/use-task-tags";
import { useSubtasks } from "../../hooks/tasks/use-subtasks";
import { useTaskNote } from "../../hooks/tasks/use-task-note";
import { PRIORITY_CONFIG } from "../../lib/constants/priority";
import { formatShortDate } from "../../lib/utils/date-format";
import {
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    isPassiveTimetableTask,
    scheduleFieldLabelOf,
} from "../../lib/utils/task/task-scheduling";
import { Skeleton } from "../primitives/Skeleton";
import { AppPane } from "../shared/AppPane";
import { CARD, FieldBlock, FieldRow, PanelHeader, PanelTrigger } from "../shared/DetailPanelSections";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { Reveal } from "../shared/Reveal";
import { CreatedBy } from "../sharing/CreatedBy";
import { TagField } from "./TagField";
import { TaskReminderRow } from "./TaskReminderRow";
import { EFFORT_OPTIONS, PRIORITY_OPTIONS } from "./task-choice-options";
import { TaskCheckbox } from "./TaskCheckbox";

const TaskNoteInline = lazy(() => import("./TaskNoteInline").then((m) => ({ default: m.TaskNoteInline })));

type Fact = { icon: ElementType; label: string; value: string; tone?: string };

/** What's set on the task, in the order the editor shows it. Nothing set, nothing listed. */
function useFacts(task: Task): Fact[] {
    const { data: sections = [] } = useSections(task.projectId);
    const schedule = getTaskScheduleSummary(task);
    const recurrence = getTaskRecurrenceSummary(task);
    const priority = PRIORITY_OPTIONS.find((p) => p.value === task.priority && p.value > 0);
    const effort = EFFORT_OPTIONS.find((e) => e.value === task.effort);
    const section = sections.find((s) => s.id === task.sectionId);
    const facts: (Fact | false | null | undefined | "" | 0)[] = [
        task.state === "WAITING" && { icon: UserCheck, label: "Waiting on", value: task.waitingOn || "Someone" },
        task.state === "COMPLETE" && {
            icon: CheckCircle2,
            label: "Complete",
            value: task.completedAt ? formatShortDate(task.completedAt) : "Done",
            tone: "text-feedback-success",
        },
        (schedule || recurrence) && {
            icon: schedule?.isDuration ? CalendarRange : Calendar,
            label: scheduleFieldLabelOf(task),
            value: recurrence?.label ?? schedule?.primaryLabel ?? "",
        },
        task.recurrenceRule &&
            recurrence?.detailLabel && { icon: Repeat, label: "Repeats", value: recurrence.detailLabel },
        task.durationEstimate &&
            !task.scheduledStart && { icon: Hourglass, label: "Takes", value: formatMinutes(task.durationEstimate) },
        task.notBefore && { icon: EyeOff, label: "Hidden until", value: formatShortDate(task.notBefore) },
        priority && {
            icon: priority.icon,
            label: "Priority",
            value: priority.label,
            tone: PRIORITY_CONFIG[priority.value].color,
        },
        effort && { icon: effort.icon, label: "Effort", value: effort.label },
        section && { icon: Columns3, label: "Section", value: section.name },
    ];
    return facts.filter((f): f is Fact => Boolean(f));
}

type TaskViewPanelProps = {
    task: Task;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
};

/** A task in a list you can only view: everything it holds, shown as facts, with nothing that looks editable. */
export function TaskViewPanel({ task, onClose, detailMode = "peek", onDetailModeChange }: TaskViewPanelProps) {
    const [open, setOpen] = useState<"notes" | "subtasks" | null>(null);
    const facts = useFacts(task);
    const { data: subtasks = [] } = useSubtasks(task.id);
    const { state: noteState } = useTaskNote(task.id);
    const addTagAssoc = useAddTaskTag();
    const removeTagAssoc = useRemoveTaskTag();
    const words = (noteState?.body ?? "").trim().split(/\s+/).filter(Boolean).length;
    const done = subtasks.filter((s) => s.isComplete).length;
    const subtaskSummary = subtasks.length ? `${done}/${subtasks.length} complete` : "No subtasks";
    const noteSummary = !noteState?.loaded
        ? "Loading…"
        : words
          ? `${words.toLocaleString()} word${words === 1 ? "" : "s"}`
          : "No notes";
    const toggle = (pane: "notes" | "subtasks") => () => setOpen((current) => (current === pane ? null : pane));

    return (
        <DetailPanelLayout
            mode={detailMode}
            onModeChange={onDetailModeChange}
            onClose={onClose}
            closeLabel="Close task details"
            title={isPassiveTimetableTask(task) ? "Fixed" : "Task"}
            leading={<TaskCheckbox task={task} compact />}
        >
            <section className={`${CARD} shrink-0 px-5 py-4`}>
                <h2 className="font-display text-[1.3rem] font-semibold leading-[1.25] tracking-[-0.025em] text-twilight-text">
                    {task.title}
                </h2>
            </section>

            {facts.length ? (
                <section className={`${CARD} flex flex-col px-4 py-1.5`} aria-label="Details">
                    {facts.map((fact) => (
                        <FieldRow key={fact.label} icon={fact.icon} label={fact.label}>
                            <span
                                className={`truncate text-right text-[13px] ${fact.tone ?? "text-twilight-text-soft"}`}
                            >
                                {fact.value}
                            </span>
                        </FieldRow>
                    ))}
                </section>
            ) : null}

            <AppPane
                value={task.linkedAppId}
                url={task.linkedUrl}
                title={task.title}
                kind="task"
                open={false}
                onOpenChange={() => {}}
                onChange={() => {}}
                readOnly
            />

            {open === "notes" ? (
                <div className={`${CARD} flex shrink-0 flex-col gap-2 px-4 py-3`}>
                    <PanelHeader title="Notes" summary={noteSummary} onDone={toggle("notes")} />
                    <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
                        <TaskNoteInline taskId={task.id} readOnly />
                    </Suspense>
                </div>
            ) : (
                <PanelTrigger
                    icon={StickyNote}
                    title="Notes"
                    summary={noteSummary}
                    onOpen={words ? toggle("notes") : undefined}
                />
            )}

            {open === "subtasks" ? null : (
                <PanelTrigger
                    icon={ListChecks}
                    title="Subtasks"
                    summary={subtaskSummary}
                    onOpen={subtasks.length ? toggle("subtasks") : undefined}
                />
            )}
            <Reveal open={open === "subtasks"} className={`${CARD} flex flex-col px-4 py-3`}>
                <PanelHeader title="Subtasks" summary={subtaskSummary} onDone={toggle("subtasks")} />
                <ul className="mt-2 flex flex-col">
                    {subtasks.map((subtask) => (
                        <li key={subtask.id} className="flex min-h-11 items-center gap-3">
                            <TaskCheckbox subtask={subtask} compact readOnly />
                            <span
                                className={`min-w-0 flex-1 text-sm ${subtask.isComplete ? "text-twilight-text-muted line-through" : "text-twilight-text-soft"}`}
                            >
                                {subtask.title}
                            </span>
                        </li>
                    ))}
                </ul>
            </Reveal>

            <fieldset className={`${CARD} flex flex-col px-4 py-1.5`} aria-label="Personal reminder and tags">
                <TaskReminderRow task={task} />
                <FieldBlock icon={Tag} label="Tags">
                    <TagField
                        tagIds={task.tagIds ?? []}
                        onAdd={(id) => addTagAssoc.mutate({ taskId: task.id, tagId: id })}
                        onRemove={(id) => removeTagAssoc.mutate({ taskId: task.id, tagId: id })}
                    />
                </FieldBlock>
            </fieldset>

            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
                <CreatedBy task={task} />
                <CreatedBy task={task} verb="Edited" />
                <p className="text-xs leading-relaxed text-twilight-text-muted" aria-label="Task metadata">
                    Created {formatShortDate(task.createdAt)}
                    {task.updatedAt !== task.createdAt && <> · Updated {formatShortDate(task.updatedAt)}</>}
                </p>
            </div>
        </DetailPanelLayout>
    );
}
