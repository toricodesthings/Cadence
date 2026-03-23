import { useState } from "react";
import { Plus, Calendar, CalendarHeart } from "lucide-react";
import { useCreateTask } from "../../hooks/tasks";
import { useProjects } from "../../hooks/projects";
import { useTags } from "../../hooks/tags";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { parseLocalDate, getDateFormatConfig } from "../../lib/utils/date-format";
import { useSettings } from "../../hooks/core/use-settings";
import { mapPriorityNameToNumber } from "../../lib/utils/task/task-defaults";
import type { Task } from "../../types/task";
import { buildCanonicalNlpEnvelope } from "../../lib/nlp/build-canonical-envelope";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { QuickAddActionTray } from "./QuickAddActionTray";
import { ParseSummaryChips } from "./ParseSummaryChips";
import { useNlpParse } from "../../hooks/use-nlp-parse";
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
    const [projectSelection, setProjectSelection] = useState<string | null>(projectId ?? null);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [ignoredTokenIds, setIgnoredTokenIds] = useState<string[]>([]);
    const [deadline, setDeadline] = useState<{
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }>({
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        recurrenceRule: null,
        isAllDay: true,
    });

    const createTask = useCreateTask();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: userSettings } = useSettings();
    const taskDefaults = userSettings?.tasks;
    const nlpEnabled = taskDefaults?.intelligence?.nlpEnabled !== false;
    const autoParseOnCapture = taskDefaults?.intelligence?.autoParseOnCapture !== false;
    const showExplanations = taskDefaults?.intelligence?.showExplanations !== false;
    const confidenceThreshold = taskDefaults?.intelligence?.confidenceThreshold ?? "medium";
    const lowStimulationMode = taskDefaults?.intelligence?.lowStimulationMode ?? false;
    const dateStyle = userSettings?.dateTime?.dateStyle ?? "mdy";
    const parsedInput = useNlpParse({
        input: value,
        projects,
        tags,
        ignoredTokenIds,
        dismissedEntityIds: ignoredTokenIds,
        sourceSurface: "inline_add",
        dateStyle,
        confidenceThreshold,
        lowStimulationMode,
        enabled: nlpEnabled && autoParseOnCapture,
    });

    const handleSubmit = () => {
        const title = parsedInput.cleanedTitle || value.trim();
        if (!title) return;

        const placement = taskDefaults?.newTaskPlacement ?? "bottom";
        const orderIndex = placement === "top" ? 0 : computeNextOrderIndex(tasks);
        const resolvedPriority = parsedInput.priority ?? mapPriorityNameToNumber(taskDefaults?.defaultPriority);
        const resolvedProjectId = projectId ?? projectSelection ?? parsedInput.projectId ?? null;
        const resolvedTagIds = Array.from(new Set([...selectedTagIds, ...parsedInput.tagIds]));
        const resolvedDeadline = {
            dueDate: deadline.dueDate ?? parsedInput.dueDate,
            scheduledStart: deadline.scheduledStart,
            scheduledEnd: deadline.scheduledEnd,
            recurrenceRule: deadline.recurrenceRule ?? parsedInput.recurrenceRule,
            isAllDay: deadline.isAllDay,
        };

        createTask.mutate({
            title,
            orderIndex,
            tagIds: resolvedTagIds,
            dueDate: resolvedDeadline.dueDate ?? undefined,
            scheduledStart: resolvedDeadline.scheduledStart ?? undefined,
            scheduledEnd: resolvedDeadline.scheduledEnd ?? undefined,
            recurrenceRule: resolvedDeadline.recurrenceRule ?? undefined,
            isAllDay: resolvedDeadline.isAllDay,
            ...(resolvedPriority && resolvedPriority > 0 && { priority: resolvedPriority as 1 | 2 | 3 | 4 }),
            ...(resolvedProjectId && { projectId: resolvedProjectId }),
            ...(sectionId && { sectionId }),
            ...(parsedInput.waitingOn && { waitingOn: parsedInput.waitingOn }),
            ...(parsedInput.durationMinutes && { durationEstimate: parsedInput.durationMinutes }),
            nlp: buildCanonicalNlpEnvelope({
                rawInput: value,
                sourceSurface: "inline_add",
                dateStyle,
                dismissedEntityIds: ignoredTokenIds,
                userOverrides: {
                    title,
                    projectId: resolvedProjectId,
                    tagIds: resolvedTagIds,
                    dueDate: resolvedDeadline.dueDate ?? null,
                    scheduledStart: resolvedDeadline.scheduledStart ?? null,
                    scheduledEnd: resolvedDeadline.scheduledEnd ?? null,
                    recurrenceRule: resolvedDeadline.recurrenceRule ?? null,
                },
            }),
        });

        setValue("");
        setIsTrayOpen(false);
        setProjectSelection(projectId ?? null);
        setSelectedTagIds([]);
        setIgnoredTokenIds([]);
        setDeadline({
            dueDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            recurrenceRule: null,
            isAllDay: true,
        });
    };

    const hasDeadlineSet = !!(deadline.dueDate || deadline.scheduledStart);
    const showScheduleTrigger = isFocused || hasDeadlineSet || value.trim().length > 0;

    const deadlineLabel = (() => {
        const locale = getDateFormatConfig().dateStyle === "dmy" ? "en-GB" : "en-US";
        if (deadline.scheduledEnd && deadline.dueDate) {
            const start = parseLocalDate(deadline.dueDate).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
            const end = parseLocalDate(deadline.scheduledEnd).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
            return `${start} \u2013 ${end}`;
        }
        if (deadline.dueDate) {
            return parseLocalDate(deadline.dueDate).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        }
        return "Add date";
    })();

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
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
                ${isFocused && !compact ? "border-lantern/20 bg-white/[0.03] shadow-[0_0_0_1px_rgba(232,164,74,0.08),0_4px_24px_rgba(232,164,74,0.04)]" : ""}
                ${isFocused && compact ? "border-lantern/40 bg-white/[0.04]" : ""}
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
                            className={`transition-colors duration-200 ${isFocused ? "text-lantern" : "text-twilight-text-muted"}`}
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
                    dueDate={deadline.dueDate}
                    scheduledStart={deadline.scheduledStart}
                    scheduledEnd={deadline.scheduledEnd}
                    recurrenceRule={deadline.recurrenceRule}
                    onChange={(updates) => setDeadline({ ...deadline, ...updates })}
                >
                    <button
                        type="button"
                        data-no-dnd="true"
                        aria-label={hasDeadlineSet ? `Deadline: ${deadlineLabel}. Click to change` : "Add task date"}
                        className={`
                            inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 ${compact ? "text-[10px]" : "text-[11px]"} font-medium
                            transition-colors duration-200
                            ${hasDeadlineSet
                                ? "opacity-100 bg-lantern/10 text-lantern"
                                : "text-twilight-text-muted/90 hover:bg-white/[0.04] hover:text-twilight-text-soft"
                            }
                        `}
                    >
                        <Calendar size={13} aria-hidden="true" />
                        {deadlineLabel}
                    </button>
                </DeadlinePickerPopover>
            ) : null}
            {(isTrayOpen || parsedInput.tokens.length > 0 || selectedTagIds.length > 0 || (!projectId && projectSelection)) ? (
                <div className={`flex w-full flex-col gap-2 ${compact ? "pl-6" : "pl-8"}`}>
                    <QuickAddActionTray
                        quickAddSettings={taskDefaults?.quickAdd}
                        projectLocked={Boolean(projectId)}
                        excludeActions={["date", "priority"]}
                        dueDate={deadline.dueDate ?? parsedInput.dueDate}
                        scheduledStart={deadline.scheduledStart}
                        scheduledEnd={deadline.scheduledEnd}
                        recurrenceRule={deadline.recurrenceRule ?? parsedInput.recurrenceRule}
                        priority={null}
                        projectId={projectId ?? projectSelection ?? parsedInput.projectId ?? null}
                        tagIds={Array.from(new Set([...selectedTagIds, ...parsedInput.tagIds]))}
                        onScheduleChange={(updates) => setDeadline({ ...deadline, ...updates })}
                        onPriorityChange={() => {}}
                        onProjectChange={(value) => setProjectSelection(value)}
                        onToggleTag={(tagId) =>
                            setSelectedTagIds((current) =>
                                current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId],
                            )
                        }
                    />
                    {showExplanations && parsedInput.parseResult.entities.length > 0 && (
                        <ParseSummaryChips
                            entities={parsedInput.parseResult.entities}
                            summary={parsedInput.summary}
                            ignoredTokenIds={ignoredTokenIds}
                            onDismissToken={(tokenId) => setIgnoredTokenIds((current) => [...current, tokenId])}
                            compact={compact}
                            lowStimulation={lowStimulationMode || userSettings?.appearance?.motion === "reduced"}
                            maxVisibleChips={3}
                        />
                    )}
                </div>
            ) : null}
            <AddPersonalEventDialog open={showEventDialog} onClose={() => setShowEventDialog(false)} />
        </form>
    );
}
