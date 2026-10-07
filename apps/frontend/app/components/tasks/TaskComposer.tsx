import { useEffect, useRef, useState } from "react";
import { CheckSquare, Clock3, Plus, StickyNote } from "lucide-react";
import { ChipScroller } from "../shared/ChipScroller";
import { ComposerMore, ComposerSubmit, ComposerTitle, ComposerToggle, COMPOSER_FIELD, type ComposerDraft } from "../shared/Composer";
import { TimePicker } from "../primitives";
import { DatePicker } from "../shared/DatePicker";
import { FIELD_LABEL } from "./task-choice-options";
import { AcceptedEffort, EffortField, EffortSuggestionRow, PriorityField } from "./TaskWeightFields";
import { useEffortSuggestion } from "../../hooks/tasks/use-effort-suggestion";
import { QuickAddActionTray } from "./QuickAddActionTray";
import { DraftRow } from "./DraftRow";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useSections } from "../../hooks/sections/use-sections";
import { useSettings } from "../../hooks/core/use-settings";
import { TASK_FIELDS, useNlpParse, type NlpParseOutput } from "../../hooks/use-nlp-parse";
import { useTypedWhen } from "../../hooks/use-typed-when";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { mapPriorityNameToNumber, resolveDefaultDueDate } from "../../lib/utils/task/task-defaults";
import { buildTypedTaskInput } from "../../lib/utils/task/typed-task-input";
import { formatShortDateLabel, formatWallTime } from "../../lib/utils/date-format";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { EffortLevel, Task, TaskPriority } from "@cadence/contracts/task";

/** Id the project board uses for tasks without a section. */
export const UNSECTIONED_ID = "ungrouped";

export const tasksIn = (tasks: Task[], sectionId: string) =>
    tasks.filter((t) => (sectionId === UNSECTIONED_ID ? !t.sectionId : t.sectionId === sectionId));

export const chipClass = (active: boolean) =>
    `touch-target inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
        active
            ? "border-accent-primary/30 bg-accent-primary/14 text-accent-primary"
            : "border-twilight-border/45 bg-white/[0.03] text-twilight-text-soft"
    }`;

const INITIAL_WHEN = { date: "", allDay: true, start: "09:00", end: "10:00" };

/**
 * The task composer: a parsed title, then when, notes and weight under More.
 * Inside a project it adds a section band; elsewhere a project and tag tray.
 */
export function useTaskComposer({
    open,
    tasks,
    project,
    lockedTag,
    onSaved,
}: {
    open: boolean;
    /** Siblings for the order index: the project's tasks, or every task. */
    tasks: Task[];
    project?: { id: string; name: string; sectionId: string; onSectionChange: (id: string) => void };
    /** The tag page it's added from: always applied, can't be untoggled. */
    lockedTag?: { id: string; name: string };
    onSaved: (created: Task | null | undefined) => void;
}): ComposerDraft {
    const { data: sections = [] } = useSections(project?.id);
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();
    const createTask = useCreateTask();
    const titleRef = useRef<HTMLInputElement>(null);
    const projectSections = project ? sections : [];
    const target = projectSections.some((s) => s.id === project?.sectionId) ? project!.sectionId : UNSECTIONED_ID;
    const targetName = projectSections.find((s) => s.id === target)?.name ?? "Unsectioned";

    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [effort, setEffortValue] = useState<EffortLevel>(null);
    // Effort is the person's: a hand-set value (or clear) beats any suggestion, and one they accepted is recorded as accepted.
    const [effortOrigin, setEffortOrigin] = useState<"manual" | "accepted" | null>(null);
    const [effortDismissed, setEffortDismissed] = useState(false);
    const setEffort = (value: EffortLevel) => { setEffortValue(value); setEffortOrigin(value ? "manual" : null); setEffortTouched(true); };
    const [effortTouched, setEffortTouched] = useState(false);
    const [dismissedEntityIds, setDismissedEntityIds] = useState<string[]>([]);
    const [acceptedEntityIds, setAcceptedEntityIds] = useState<string[]>([]);
    const [literal, setLiteral] = useState(false);
    const [manualProject, setManualProject] = useState<string | null | undefined>(undefined);
    const [manualTags, setManualTags] = useState<string[] | undefined>(undefined);

    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => titleRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [open]);

    // "Send deck Fri 3pm": a typed day and time fill the when, until a field is touched.
    const intelligence = settings?.tasks?.intelligence;
    const dateStyle = settings?.dateTime?.dateStyle ?? "mdy";
    const typedWhen = useTypedWhen(INITIAL_WHEN);
    const nlp = useNlpParse({
        input: title,
        projects: project ? [] : projects.map((p) => ({ id: p.id, name: p.name })),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        dismissedEntityIds,
        acceptedEntityIds,
        literal,
        manual: {
            ...typedWhen.manual,
            ...(priority > 0 && { priority }),
            ...(manualProject !== undefined && { projectId: manualProject }),
            ...(manualTags && { tagIds: manualTags }),
        },
        capabilities: TASK_FIELDS,
        enabled: open && intelligence?.nlpEnabled !== false && intelligence?.autoParseOnCapture !== false,
        sourceSurface: project ? "inline_add" : "quick_add",
        dateStyle,
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
    });
    const typed = typedWhen.bind(nlp);
    const { when } = typed;
    const resolvedProjectId = project?.id ?? nlp.fields.projectId;
    const resolvedTagIds = Array.from(new Set([...(lockedTag ? [lockedTag.id] : []), ...nlp.fields.tagIds]));
    const submitTitle = nlp.cleanedTitle.trim() || title.trim();
    const effortSuggestion = useEffortSuggestion({ title: submitTitle, projectId: resolvedProjectId, chosen: effortTouched ? effort : undefined, dismissed: effortDismissed, literal, open });

    const reset = () => {
        setTitle(""); setNotes(""); setPriority(0); setEffortValue(null); setEffortOrigin(null); setEffortTouched(false); setEffortDismissed(false); setManualProject(undefined); setManualTags(undefined); setDismissedEntityIds([]); setAcceptedEntityIds([]); setLiteral(false);
        typed.reset();
    };

    const whenSummary = when.date
        ? `${formatShortDateLabel(when.date)}${when.allDay ? "" : ` · ${formatWallTime(when.start)}`}`
        : null;

    const submit = async () => {
        if (!title.trim() || createTask.isPending) return;
        // Enter saves what is on screen; only a still-loading parser makes it wait, then re-reads the same text.
        if (!nlp.ready) {
            const draft = await nlp.finalize();
            return send(draft);
        }
        send(nlp);
    };

    const send = (draft: NlpParseOutput) => {
        const finalTitle = draft.cleanedTitle.trim() || title.trim();
        // A timed block sends instants only; an all-day task sends its day.
        const start = draft.fields.scheduledStart;
        const end = draft.fields.scheduledEnd;
        const siblings = project ? tasksIn(tasks, target) : tasks;

        trackUsageEvent("task.create", { surface: project ? "inline_add" : "quick_add", object_type: "task" });
        createTask.mutate(
            buildTypedTaskInput({
                rawInput: title,
                title: finalTitle,
                schedule: {
                    dueDate: start ? null : draft.fields.dueDate || resolveDefaultDueDate(settings?.tasks?.defaultDueDate) || null,
                    scheduledStart: start,
                    scheduledEnd: end,
                    recurrenceRule: draft.fields.recurrenceRule,
                },
                priority: (draft.fields.priority || mapPriorityNameToNumber(settings?.tasks?.defaultPriority)) as TaskPriority,
                projectId: project?.id ?? draft.fields.projectId,
                tagIds: Array.from(new Set([...(lockedTag ? [lockedTag.id] : []), ...draft.fields.tagIds])),
                waitingOn: draft.fields.waitingOn,
                durationMinutes: draft.fields.durationMinutes,
                notBefore: draft.fields.notBefore,
                reminderAt: draft.fields.reminderAt,
                surface: project ? "inline_add" : "quick_add",
                dateStyle,
                dismissedEntityIds,
                extra: {
                    orderIndex: settings?.tasks?.newTaskPlacement === "top" ? 0 : computeNextOrderIndex(siblings),
                    content: notes.trim() || null,
                    effort,
                    ...(effort && effortOrigin && { effortOrigin }),
                    ...(project && target !== UNSECTIONED_ID && { sectionId: target }),
                },
            }),
            {
                onSuccess: (created) => {
                    reset();
                    onSaved(created);
                },
            },
        );
    };

    const band = projectSections.length > 0 ? (
        <ChipScroller role="group" aria-label="Add to section">
            {[{ id: UNSECTIONED_ID, name: "Unsectioned" }, ...projectSections].map((s) => (
                <button key={s.id} type="button" aria-pressed={target === s.id} onClick={() => project?.onSectionChange(s.id)} className={chipClass(target === s.id)}>
                    {s.name}
                </button>
            ))}
        </ChipScroller>
    ) : undefined;

    return {
        title: "Add task",
        icon: CheckSquare,
        subtitle: project
            ? (projectSections.length > 0 ? `${project.name} · ${targetName}` : project.name)
            : lockedTag ? `Tagged #${lockedTag.name}` : "Lands in Capture unless you pick a list",
        band,
        isDirty: Boolean(title.trim() || notes.trim() || typed.touched || priority > 0 || effort !== null || manualProject || manualTags?.length),
        discardTitle: "Discard this task?",
        footer: <ComposerSubmit onSubmit={() => void submit()} submitLabel={createTask.isPending ? "Adding…" : "Add task"} icon={Plus} disabled={!submitTitle || createTask.isPending} />,
        reset,
        children: (
            <>
                <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
                    <ComposerTitle
                        inputRef={titleRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What needs doing? e.g. Send deck Fri 3pm"
                        aria-label="Task title"
                        enterKeyHint="done"
                    />
                    <DraftRow
                        applied={nlp.applied}
                        suggestions={nlp.suggestions}
                        shownElsewhere={["due_date", "scheduled_start", "project", "tag"]}
                        literal={literal}
                        onDismiss={(id) => setDismissedEntityIds((prev) => [...prev, id])}
                        onAccept={(id) => setAcceptedEntityIds((prev) => [...prev, id])}
                        onLiteral={setLiteral}
                    />
                    {effort && effortOrigin === "accepted" ? (
                        <AcceptedEffort level={effort} onUndo={() => { setEffortValue(null); setEffortOrigin(null); setEffortTouched(false); }} />
                    ) : effortSuggestion ? (
                        <EffortSuggestionRow
                            suggestion={effortSuggestion}
                            onUse={(level) => { setEffortValue(level); setEffortOrigin("accepted"); setEffortTouched(true); }}
                            onDismiss={() => setEffortDismissed(true)}
                        />
                    ) : null}
                    <QuickAddActionTray
                        quickAddSettings={settings?.tasks?.quickAdd}
                        projectLocked={Boolean(project)}
                        excludeActions={["date", "priority"]}
                        dueDate={null}
                        scheduledStart={null}
                        recurrenceRule={null}
                        priority={null}
                        projectId={resolvedProjectId}
                        tagIds={resolvedTagIds}
                        onScheduleChange={() => {}}
                        onPriorityChange={() => {}}
                        onProjectChange={setManualProject}
                        onToggleTag={(tagId) => tagId !== lockedTag?.id && setManualTags((current) => {
                            const shown = current ?? nlp.fields.tagIds;
                            return shown.includes(tagId) ? shown.filter((id) => id !== tagId) : [...shown, tagId];
                        })}
                    />
                </form>

                <ComposerMore summary={whenSummary}>
                    <div className="space-y-1.5">
                        <span className="flex h-6 items-center justify-between">
                            <span className={FIELD_LABEL}>Date</span>
                            {when.date ? (
                                <button
                                    type="button"
                                    onClick={() => typed.edit({ date: "", allDay: true })}
                                    className="flex min-h-9 cursor-pointer items-center rounded-lg px-2 text-[11px] font-medium text-twilight-text-soft transition-colors hover:text-twilight-text"
                                >
                                    Clear
                                </button>
                            ) : null}
                        </span>
                        <DatePicker label="Date" value={when.date} onChange={(date) => { if (date) typed.edit({ date }); }} />
                    </div>

                    {when.date ? (
                        <ComposerToggle
                            icon={Clock3}
                            iconClassName="text-moonlit"
                            label="All day"
                            description={when.allDay ? "Any time that day." : "Blocked out on your schedule."}
                            checked={when.allDay}
                            onCheckedChange={(allDay) => typed.edit({ allDay })}
                            ariaLabel="All day"
                        >
                            {when.allDay ? null : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="space-y-1.5">
                                        <span className={FIELD_LABEL}>Start</span>
                                        <TimePicker value={when.start} onChange={(start) => typed.edit({ start })} icon={<Clock3 size={14} className="text-moonlit" />} />
                                    </label>
                                    <label className="space-y-1.5">
                                        <span className={FIELD_LABEL}>End</span>
                                        <TimePicker value={when.end} onChange={(end) => typed.edit({ end })} icon={<Clock3 size={14} className="text-moonlit" />} />
                                    </label>
                                </div>
                            )}
                        </ComposerToggle>
                    ) : null}

                    <label className="block">
                        <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                            <StickyNote size={12} aria-hidden="true" />
                            Notes
                        </span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            className={`${COMPOSER_FIELD} resize-y`}
                            placeholder="Context, links, next step…"
                        />
                    </label>

                    <PriorityField value={priority} onChange={setPriority} />
                    <EffortField value={effort} onChange={setEffort} />
                </ComposerMore>
            </>
        ),
    };
}
