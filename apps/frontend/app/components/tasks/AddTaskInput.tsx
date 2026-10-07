import { useRef, useState } from "react";
import { Plus, Calendar, CalendarHeart } from "lucide-react";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { formatDateSpan, formatShortDate, formatShortDateTime } from "../../lib/utils/date-format";
import { useSettings } from "../../hooks/core/use-settings";
import { mapPriorityNameToNumber } from "../../lib/utils/task/task-defaults";
import { buildTypedTaskInput } from "../../lib/utils/task/typed-task-input";
import type { EffortLevel, Task, TaskPriority } from "@cadence/contracts/task";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import type { ScheduleUpdates } from "./QuickScheduleSurface";
import { QuickAddActionTray } from "./QuickAddActionTray";
import { DraftRow } from "./DraftRow";
import { AcceptedEffort, EffortSuggestionRow } from "./TaskWeightFields";
import { useEffortSuggestion } from "../../hooks/tasks/use-effort-suggestion";
import { TASK_FIELDS, useNlpParse, type NlpParseOutput } from "../../hooks/use-nlp-parse";
import type { DraftFields } from "@cadence/domain/nlp-draft";
import { trackUsageEvent } from "../../lib/api/track-event";
import * as ContextMenu from "../primitives/ContextMenu";
import { AddPersonalEventDialog } from "../calendar/AddPersonalEventDialog";

interface AddTaskInputProps {
    projectId?: string;
    sectionId?: string;
    compact?: boolean;
    placeholder?: string;
    tasks: Task[];
}

/** Input field for quick task creation — submits on Enter, optimistic insert */
export function AddTaskInput({
    projectId,
    sectionId,
    tasks,
    compact = false,
    placeholder,
}: AddTaskInputProps) {
    const [value, setValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const [isTrayOpen, setIsTrayOpen] = useState(false);
    const [showEventDialog, setShowEventDialog] = useState(false);
    const [manualProject, setManualProject] = useState<string | null | undefined>(undefined);
    const [manualTags, setManualTags] = useState<string[] | undefined>(undefined);
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [accepted, setAccepted] = useState<string[]>([]);
    const [literal, setLiteral] = useState(false);
    const [deadline, setDeadline] = useState<ScheduleUpdates | null>(null);
    // No Effort control here: the only Effort an inline add sets is a suggestion the person used.
    const [effort, setEffort] = useState<EffortLevel>(null);
    const [effortDismissed, setEffortDismissed] = useState(false);
    const submitting = useRef(false);

    const createTask = useCreateTask();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: userSettings } = useSettings();
    const taskDefaults = userSettings?.tasks;
    const nlpEnabled = taskDefaults?.intelligence?.nlpEnabled !== false;
    const autoParseOnCapture = taskDefaults?.intelligence?.autoParseOnCapture !== false;
    const confidenceThreshold = taskDefaults?.intelligence?.confidenceThreshold ?? "medium";
    const dateStyle = userSettings?.dateTime?.dateStyle ?? "mdy";

    // What the user set by hand beats the words: a key that is present wins, even when it is "none".
    const manual: Partial<DraftFields> = {
        ...(manualProject !== undefined && { projectId: manualProject }),
        ...(manualTags && { tagIds: manualTags }),
        ...(deadline && {
            dueDate: deadline.dueDate,
            scheduledStart: deadline.scheduledStart,
            scheduledEnd: deadline.scheduledEnd,
            recurrenceRule: deadline.recurrenceRule,
        }),
    };
    const parsedInput = useNlpParse({
        input: value,
        // Inside a list the list is fixed, so list names stay words in the title (as in the task composer).
        projects: projectId ? [] : projects,
        tags,
        dismissedEntityIds: dismissed,
        acceptedEntityIds: accepted,
        manual,
        literal,
        capabilities: TASK_FIELDS,
        sourceSurface: "inline_add",
        dateStyle,
        confidenceThreshold,
        enabled: nlpEnabled && autoParseOnCapture,
    });

    const effortSuggestion = useEffortSuggestion({
        title: parsedInput.cleanedTitle,
        projectId: projectId ?? parsedInput.fields.projectId,
        chosen: effort ?? undefined,
        dismissed: effortDismissed,
        literal,
        open: Boolean(value.trim()),
    });

    const schedule = (draft: Pick<NlpParseOutput, "fields">): ScheduleUpdates => ({
        dueDate: draft.fields.dueDate,
        endDate: deadline?.endDate ?? null,
        scheduledStart: draft.fields.scheduledStart,
        scheduledEnd: draft.fields.scheduledEnd,
        recurrenceRule: draft.fields.recurrenceRule,
    });

    const save = (draft: NlpParseOutput) => {
        const rawTitle = value.trim();
        const placement = taskDefaults?.newTaskPlacement ?? "bottom";
        const orderIndex = placement === "top" ? 0 : computeNextOrderIndex(tasks);

        trackUsageEvent("task.create", { surface: "inline_add", object_type: "task" });
        createTask.mutate(buildTypedTaskInput({
            rawInput: value,
            title: draft.cleanedTitle || rawTitle,
            schedule: schedule(draft),
            priority: (draft.fields.priority || mapPriorityNameToNumber(taskDefaults?.defaultPriority)) as TaskPriority,
            projectId: projectId ?? draft.fields.projectId,
            tagIds: draft.fields.tagIds,
            waitingOn: draft.fields.waitingOn,
            durationMinutes: draft.fields.durationMinutes,
            notBefore: draft.fields.notBefore,
            reminderAt: draft.fields.reminderAt,
            surface: "inline_add",
            dateStyle,
            dismissedEntityIds: dismissed,
            extra: { orderIndex, ...(sectionId && { sectionId }), ...(effort && { effort, effortOrigin: "accepted" as const }) },
        }));

        setValue("");
        setIsTrayOpen(false);
        setManualProject(undefined);
        setManualTags(undefined);
        setDismissed([]);
        setAccepted([]);
        setLiteral(false);
        setDeadline(null);
        setEffort(null);
        setEffortDismissed(false);
    };

    const handleSubmit = async () => {
        if (!value.trim() || submitting.current) return;
        // Enter saves what is on screen; only a still-loading parser makes it wait (then re-reads the same text).
        if (parsedInput.ready) return save(parsedInput);
        submitting.current = true;
        try {
            save(await parsedInput.finalize());
        } finally {
            submitting.current = false;
        }
    };

    const previewDeadline = schedule(parsedInput);
    const hasDeadlineSet = Boolean(previewDeadline.dueDate || previewDeadline.scheduledStart);
    const showScheduleTrigger = isFocused || hasDeadlineSet || value.trim().length > 0;

    const deadlineLabel = previewDeadline.scheduledStart
        ? formatShortDateTime(previewDeadline.scheduledStart)
        : previewDeadline.dueDate && previewDeadline.endDate
            ? formatDateSpan(previewDeadline.dueDate, previewDeadline.endDate)
            : previewDeadline.dueDate
                ? formatShortDate(previewDeadline.dueDate)
                : "Add date";

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
            }}
            onFocusCapture={() => {
                setIsFocused(true);
                setIsTrayOpen(true);
            }}
            onBlurCapture={(e) => {
                const nextFocused = e.relatedTarget as Node | null;
                if (nextFocused && e.currentTarget.contains(nextFocused)) {
                    return;
                }
                if (
                    nextFocused instanceof HTMLElement &&
                    nextFocused.closest('[data-cadence-popover-content="true"], [data-cadence-dialog-content="true"]')
                ) {
                    return;
                }
                setIsFocused(false);
                setIsTrayOpen(Boolean(value.trim()) || hasDeadlineSet);
            }}
            className={`
                flex flex-wrap items-center border
                ${compact ? "gap-2 rounded-[10px] px-3 py-2 shadow-none" : "gap-4 rounded-2xl px-6 py-5"}
                transition-[color,background-color,border-color,box-shadow] duration-200
                ${compact && !isFocused ? "border-transparent bg-transparent hover:bg-white/[0.02]" : ""}
                ${!compact && !isFocused ? "border-twilight-border bg-transparent hover:border-twilight-border-light" : ""}
                ${isFocused && !compact ? "border-accent-primary/20 bg-white/[0.03] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_8%,transparent),0_4px_24px_color-mix(in_srgb,var(--accent-primary)_4%,transparent)]" : ""}
                ${isFocused && compact ? "border-accent-primary/40 bg-white/[0.04]" : ""}
            `}
            aria-label="Add new task"
            data-focus-container
        >
            <ContextMenu.Root>
                <ContextMenu.Trigger asChild>
                    <span className="shrink-0 cursor-default">
                        <Plus
                            size={compact ? 14 : 18}
                            aria-hidden="true"
                            className={`transition-colors duration-200 ${isFocused ? "text-accent-primary" : "text-twilight-text-muted"}`}
                        />
                    </span>
                </ContextMenu.Trigger>
                <ContextMenu.Content>
                    <ContextMenu.Item onSelect={() => setShowEventDialog(true)}>
                        <div className="flex items-center gap-2">
                            <CalendarHeart size={15} />
                            <span>Add personal event</span>
                        </div>
                    </ContextMenu.Item>
                </ContextMenu.Content>
            </ContextMenu.Root>
            <input
                type="text"
                data-add-task-input
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    setIsTrayOpen(true);
                }}
                placeholder={placeholder ?? (compact ? "Add task to section..." : "What needs to be done?")}
                aria-label="New task title"
                className={`flex-1 bg-transparent text-twilight-text outline-none placeholder:text-twilight-text-muted/60 ${compact ? "text-sm h-7" : "text-base"}`}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        setValue("");
                        (e.target as HTMLInputElement).blur();
                    }
                }}
            />

            {showScheduleTrigger ? (
                <DeadlinePickerPopover
                    dueDate={previewDeadline.dueDate}
                    endDate={previewDeadline.endDate}
                    scheduledStart={previewDeadline.scheduledStart}
                    scheduledEnd={previewDeadline.scheduledEnd}
                    recurrenceRule={previewDeadline.recurrenceRule}
                    onChange={(updates) => setDeadline(updates)}
                >
                    <button
                        type="button"
                        data-no-dnd="true"
                        aria-label={hasDeadlineSet ? `Deadline: ${deadlineLabel}. Click to change` : "Add task date"}
                        className={`
                            inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 ${compact ? "text-[10px]" : "text-[11px]"} font-medium
                            transition-colors duration-200
                            ${hasDeadlineSet
                                ? "opacity-100 bg-accent-primary/10 text-accent-primary"
                                : "text-twilight-text-muted/90 hover:bg-white/[0.04] hover:text-twilight-text-soft"
                            }
                        `}
                    >
                        <Calendar size={13} aria-hidden="true" />
                        {deadlineLabel}
                    </button>
                </DeadlinePickerPopover>
            ) : null}
            {(isTrayOpen || parsedInput.applied.length > 0 || parsedInput.suggestions.length > 0 || literal || effortSuggestion || effort) ? (
                <div className={`flex w-full flex-col gap-2 ${compact ? "pl-6" : "pl-8"}`}>
                    <QuickAddActionTray
                        quickAddSettings={taskDefaults?.quickAdd}
                        projectLocked={Boolean(projectId)}
                        excludeActions={["date", "priority"]}
                        dueDate={previewDeadline.dueDate}
                        scheduledStart={previewDeadline.scheduledStart}
                        endDate={previewDeadline.endDate}
                        scheduledEnd={previewDeadline.scheduledEnd}
                        recurrenceRule={previewDeadline.recurrenceRule}
                        priority={null}
                        projectId={projectId ?? parsedInput.fields.projectId}
                        tagIds={parsedInput.fields.tagIds}
                        onScheduleChange={(updates) => setDeadline(updates)}
                        onPriorityChange={() => {}}
                        onProjectChange={(value) => setManualProject(value)}
                        onToggleTag={(tagId) =>
                            setManualTags((current) => {
                                const shown = current ?? parsedInput.fields.tagIds;
                                return shown.includes(tagId) ? shown.filter((item) => item !== tagId) : [...shown, tagId];
                            })
                        }
                    />
                    <DraftRow
                        applied={parsedInput.applied}
                        suggestions={parsedInput.suggestions}
                        shownElsewhere={["due_date", "scheduled_start", "project", "tag"]}
                        literal={literal}
                        onDismiss={(id) => setDismissed((current) => [...current, id])}
                        onAccept={(id) => setAccepted((current) => [...current, id])}
                        onLiteral={setLiteral}
                    />
                    {effort ? (
                        <AcceptedEffort level={effort} onUndo={() => setEffort(null)} />
                    ) : effortSuggestion ? (
                        <EffortSuggestionRow suggestion={effortSuggestion} onUse={setEffort} onDismiss={() => setEffortDismissed(true)} />
                    ) : null}
                </div>
            ) : null}
            <AddPersonalEventDialog open={showEventDialog} onClose={() => setShowEventDialog(false)} />
        </form>
    );
}
