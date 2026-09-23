import { useEffect, useRef, useState } from "react";
import { CheckSquare, Clock3, Plus, StickyNote } from "lucide-react";
import { ChipScroller } from "../shared/ChipScroller";
import { ComposerMore, ComposerSubmit, ComposerTitle, ComposerToggle, COMPOSER_FIELD, type ComposerDraft } from "../shared/Composer";
import { TimePicker } from "../primitives";
import { DatePicker } from "../shared/DatePicker";
import { FIELD_LABEL } from "./task-choice-options";
import { EffortField, PriorityField } from "./TaskWeightFields";
import { QuickAddActionTray } from "./QuickAddActionTray";
import { ParseSummaryChips } from "./ParseSummaryChips";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useSections } from "../../hooks/sections/use-sections";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useTypedWhen } from "../../hooks/use-typed-when";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { mapPriorityNameToNumber, resolveDefaultDueDate } from "../../lib/utils/task/task-defaults";
import { buildTypedTaskInput } from "../../lib/utils/task/typed-task-input";
import { formatShortDateLabel, formatTime } from "../../lib/utils/date-format";
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
    const [effort, setEffort] = useState<EffortLevel>(null);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [dismissedEntityIds, setDismissedEntityIds] = useState<string[]>([]);

    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => titleRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [open]);

    // "Send deck Fri 3pm": a typed day and time fill the when, until a field is touched.
    const intelligence = settings?.tasks?.intelligence;
    const dateStyle = settings?.dateTime?.dateStyle ?? "mdy";
    const nlp = useNlpParse({
        input: title,
        projects: project ? [] : projects.map((p) => ({ id: p.id, name: p.name })),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        dismissedEntityIds,
        enabled: open && intelligence?.nlpEnabled !== false && intelligence?.autoParseOnCapture !== false,
        sourceSurface: project ? "inline_add" : "quick_add",
        dateStyle,
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
        lowStimulationMode: intelligence?.lowStimulationMode ?? false,
    });
    const typed = useTypedWhen(nlp, INITIAL_WHEN);
    const { when } = typed;
    const resolvedProjectId = project?.id ?? projectId ?? nlp.projectId ?? null;
    const resolvedTagIds = Array.from(new Set([...(lockedTag ? [lockedTag.id] : []), ...tagIds, ...nlp.tagIds]));
    const parsed = typed.parsed || Boolean(nlp.tagIds.length || (!project && !projectId && nlp.projectId) || (!priority && nlp.priority) || nlp.waitingOn);
    const submitTitle = (parsed && nlp.cleanedTitle.trim()) || title.trim();

    const reset = () => {
        setTitle(""); setNotes(""); setPriority(0); setEffort(null); setProjectId(null); setTagIds([]); setDismissedEntityIds([]);
        typed.reset();
    };

    const whenSummary = when.date
        ? `${formatShortDateLabel(when.date)}${when.allDay ? "" : ` · ${formatTime(new Date(`${when.date}T${when.start}:00`).toISOString())}`}`
        : null;

    const submit = () => {
        if (!submitTitle || createTask.isPending) return;
        const timed = when.date && !when.allDay;
        const start = timed ? new Date(`${when.date}T${when.start}:00`) : null;
        const end = timed ? new Date(`${when.date}T${when.end}:00`) : null;
        if (start && end && end <= start) end.setDate(end.getDate() + 1);
        const siblings = project ? tasksIn(tasks, target) : tasks;

        trackUsageEvent("task.create", { surface: project ? "inline_add" : "quick_add", object_type: "task" });
        createTask.mutate(
            buildTypedTaskInput({
                rawInput: title,
                title: submitTitle,
                schedule: {
                    dueDate: when.date || resolveDefaultDueDate(settings?.tasks?.defaultDueDate) || null,
                    scheduledStart: start?.toISOString() ?? null,
                    scheduledEnd: end?.toISOString() ?? null,
                    recurrenceRule: typed.touched ? null : nlp.recurrenceRule,
                    isAllDay: !timed,
                },
                priority: priority || nlp.priority || mapPriorityNameToNumber(settings?.tasks?.defaultPriority),
                projectId: resolvedProjectId,
                tagIds: resolvedTagIds,
                waitingOn: nlp.waitingOn,
                durationMinutes: nlp.durationMinutes,
                surface: project ? "inline_add" : "quick_add",
                dateStyle,
                dismissedEntityIds,
                extra: {
                    orderIndex: settings?.tasks?.newTaskPlacement === "top" ? 0 : computeNextOrderIndex(siblings),
                    content: notes.trim() || null,
                    effort,
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

    const showExplanations = intelligence?.showExplanations !== false;

    return {
        title: "Add task",
        icon: CheckSquare,
        subtitle: project
            ? (projectSections.length > 0 ? `${project.name} · ${targetName}` : project.name)
            : lockedTag ? `Tagged #${lockedTag.name}` : "Lands in Holding unless you pick a project",
        band,
        isDirty: Boolean(title.trim() || notes.trim() || typed.touched || priority > 0 || effort !== null || projectId || tagIds.length),
        discardTitle: "Discard this task?",
        footer: <ComposerSubmit onSubmit={submit} submitLabel={createTask.isPending ? "Adding…" : "Add task"} icon={Plus} disabled={!submitTitle || createTask.isPending} />,
        reset,
        children: (
            <>
                <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
                    <ComposerTitle
                        inputRef={titleRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What needs doing? e.g. Send deck Fri 3pm"
                        aria-label="Task title"
                        enterKeyHint="done"
                    />
                    {showExplanations ? (
                        <ParseSummaryChips
                            parseResult={nlp.parseResult}
                            summary={nlp.summary}
                            onDismiss={(entityId) => setDismissedEntityIds((prev) => [...prev, entityId])}
                            lowStimulation={intelligence?.lowStimulationMode || settings?.appearance?.motion === "reduced"}
                            maxVisibleChips={4}
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
                        onProjectChange={setProjectId}
                        onToggleTag={(tagId) => tagId !== lockedTag?.id && setTagIds((current) => (current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]))}
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
