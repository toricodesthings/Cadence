import { useState } from "react";
import { Bell, CalendarClock, Clock3, Flame, FolderOpen, ListChecks, Repeat, StickyNote, Tag } from "lucide-react";
import { toast } from "sonner";
import { TimePicker } from "../primitives";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse, type NlpParseOutput } from "../../hooks/use-nlp-parse";
import type { DraftField } from "@cadence/domain/nlp-draft";
import { DraftRow } from "../tasks/DraftRow";
import { CadencePicker } from "./CadencePicker";
import { DayTimes } from "./DayTimes";
import { ColourDot } from "../shared/ColourDot";
import { FieldBlock, FieldRow, ValueSelect } from "../shared/DetailPanelSections";
import { TagField } from "../tasks/TagField";
import { ROUTINE_DEFAULT_ACCENT, ROUTINE_SWATCHES, routineTone } from "../../lib/utils/habits";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { Composer, type ComposerDraft, ComposerSubmit, ComposerMore, ComposerTabs, ComposerTitle, ComposerToggle, COMPOSER_FIELD } from "../shared/Composer";
import { CHIP_BASE, CHIP_IDLE, FIELD_LABEL } from "../tasks/task-choice-options";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { fromTimeValue } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";
import type { Habit, RoutineStep } from "@cadence/contracts/habit";
import { RoutineStepsEditor } from "./RoutineSteps";
import { createHabitSchema } from "../../lib/validations/habit-schemas";

const IDEAS = [
    { emoji: "🌅", colorAccent: "luminous-amber", title: "Morning review", description: "Check Today, clear Capture, and start with intention.", recurrenceRule: "FREQ=DAILY" },
    { emoji: "🏋️", colorAccent: "ember-red", title: "Workout", description: "Keep a steady training rhythm across the week.", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" },
    { emoji: "💧", colorAccent: "sky", title: "Hydration", description: "A small daily reset that keeps the baseline healthy.", recurrenceRule: "FREQ=DAILY" },
    { emoji: "📚", colorAccent: "violet", title: "Reading", description: "A calm evening reading routine.", recurrenceRule: "FREQ=DAILY" },
] as const;

const DEFAULT_TIME = "09:00";

/** What a routine stores: a cadence, a time of day, a list and tags. */
const ROUTINE_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>(["recurrenceRule", "timeOfDay", "projectId", "tagIds"]);

/** New routine, alone in the composer (the Routines page). */
export function CreateHabitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { reset, ...draft } = useRoutineComposer({ onSaved: () => onOpenChange(false) });
    return <Composer open={open} onClose={() => { reset(); onOpenChange(false); }} {...draft} />;
}

/** The routine composer: name, which days, when, then everything optional. */
export function useRoutineComposer({ onSaved }: { onSaved: (created: Habit | null | undefined) => void }): ComposerDraft {
    const shell = useShellMode();
    const { mutate: createHabit, isPending } = useCreateHabit();
    const { data: projects = [] } = useProjects();
    const { data: allTags = [] } = useTags();

    const [title, setTitle] = useState("");
    const [emoji, setEmoji] = useState<string | null>(null);
    const [colorAccent, setColorAccent] = useState<string>(ROUTINE_DEFAULT_ACCENT);
    const [targetTimes, setTargetTimes] = useState<Record<string, string> | null>(null);
    const [ruleState, setRuleState] = useState("FREQ=DAILY");
    const [timeState, setTimeState] = useState<string | null>(null);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [description, setDescription] = useState("");
    const [projectState, setProjectState] = useState<string | null>(null);
    const [tagState, setTagState] = useState<string[]>([]);
    const [touched, setTouched] = useState<ReadonlySet<DraftField>>(new Set());
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [accepted, setAccepted] = useState<string[]>([]);
    const [literal, setLiteral] = useState(false);
    const [steps, setSteps] = useState<RoutineStep[] | null>(null);

    // What the user set by hand beats the words (a present key wins, even "none"); otherwise the words fill it.
    const touch = (field: DraftField) => setTouched((current) => new Set(current).add(field));
    const { data: settings } = useSettings();
    const intelligence = settings?.tasks?.intelligence;
    const nlp = useNlpParse({
        input: title,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        tags: allTags.map((t) => ({ id: t.id, name: t.name })),
        dismissedEntityIds: dismissed,
        acceptedEntityIds: accepted,
        literal,
        manual: {
            ...(touched.has("recurrenceRule") && { recurrenceRule: ruleState }),
            ...(touched.has("timeOfDay") && { timeOfDay: timeState }),
            ...(touched.has("projectId") && { projectId: projectState }),
            ...(touched.has("tagIds") && { tagIds: tagState }),
        },
        capabilities: ROUTINE_FIELDS,
        sourceSurface: "quick_add",
        dateStyle: settings?.dateTime?.dateStyle ?? "mdy",
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
        enabled: intelligence?.nlpEnabled !== false,
    });
    const recurrenceRule = touched.has("recurrenceRule") ? ruleState : (nlp.fields.recurrenceRule ?? ruleState);
    const targetTime = touched.has("timeOfDay") ? timeState : (nlp.fields.timeOfDay ?? timeState);
    const projectId = touched.has("projectId") ? projectState : (nlp.fields.projectId ?? projectState);
    const tagIds = touched.has("tagIds") ? tagState : (nlp.fields.tagIds.length ? nlp.fields.tagIds : tagState);
    const setRecurrenceRule = (rule: string) => { setRuleState(rule); touch("recurrenceRule"); };
    const setTargetTime = (time: string | null) => { setTimeState(time); touch("timeOfDay"); };
    const setProjectId = (id: string | null) => { setProjectState(id); touch("projectId"); };
    const setTagIds = (update: string[] | ((prev: string[]) => string[])) => {
        setTagState(typeof update === "function" ? update(tagIds) : update);
        touch("tagIds");
    };

    const isDirty = Boolean(title.trim() || emoji || colorAccent !== ROUTINE_DEFAULT_ACCENT || recurrenceRule !== "FREQ=DAILY" || targetTime || targetTimes || description.trim() || projectId || tagIds.length || steps);

    const reset = () => {
        setTitle("");
        setEmoji(null);
        setColorAccent(ROUTINE_DEFAULT_ACCENT);
        setTargetTimes(null);
        setRuleState("FREQ=DAILY");
        setTimeState(null);
        setReminderEnabled(false);
        setDescription("");
        setProjectState(null);
        setTagState([]);
        setSteps(null);
        setTouched(new Set());
        setDismissed([]);
        setAccepted([]);
        setLiteral(false);
    };

    const submit = async () => {
        if (!title.trim() || isPending) return;
        // Enter saves what is on screen; only a still-loading parser makes it wait, then re-reads the same text.
        send(nlp.ready ? nlp : await nlp.finalize());
    };

    const send = (draft: NlpParseOutput) => {
        const rule = touched.has("recurrenceRule") ? ruleState : (draft.fields.recurrenceRule ?? ruleState);
        const time = touched.has("timeOfDay") ? timeState : (draft.fields.timeOfDay ?? timeState);
        const list = touched.has("projectId") ? projectState : (draft.fields.projectId ?? projectState);
        const tagged = touched.has("tagIds") ? tagState : (draft.fields.tagIds.length ? draft.fields.tagIds : tagState);
        const parsed = createHabitSchema.safeParse({
            title: (draft.cleanedTitle || title).trim(),
            description: description.trim() || undefined,
            recurrenceRule: rule,
            colorAccent,
            targetTime: time,
            targetTimes,
            emoji,
            reminderEnabled: Boolean(time) && reminderEnabled,
            projectId: list,
            tagIds: tagged.length ? tagged : undefined,
            steps: steps ?? undefined,
        });
        if (!parsed.success) {
            toast.error(parsed.error.issues[0]?.message ?? "Couldn't create routine");
            return;
        }
        createHabit(parsed.data, {
            onSuccess: (created) => {
                reset();
                onSaved(created);
            },
        });
    };

    const summary = getTaskRecurrenceSummary({
        recurrenceRule,
        scheduledStart: targetTime ? fromTimeValue(today(), targetTime) : null,
        scheduledEnd: null,
    });
    const subtitle = `${summary?.label ?? "Repeats"}${targetTime ? "" : ", any time"}`;

    const projectName = projects.find((project) => project.id === projectId)?.name;
    const moreSummary = [steps ? `${steps.length} step${steps.length > 1 ? "s" : ""}` : null, targetTimes ? "times by day" : null, projectName, tagIds.length ? `${tagIds.length} tag${tagIds.length > 1 ? "s" : ""}` : null, description.trim() ? "purpose" : null]
        .filter(Boolean)
        .join(" · ");

    return {
        title: "New routine",
        icon: Flame,
        tone: "habits",
        subtitle,
        isDirty,
        discardTitle: "Discard this routine?",
        footer: <ComposerSubmit onSubmit={() => void submit()} submitLabel={isPending ? "Creating…" : "Create routine"} icon={Repeat} tone="habits" disabled={!title.trim() || isPending} />,
        reset,
        children: (
            <>
            <div className="space-y-3">
                <ComposerTitle
                    autoFocus={!shell.isCompact}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && title.trim()) void submit(); }}
                    placeholder="Name this routine…"
                    maxLength={200}
                    aria-label="Routine name"
                    leading={(
                        <span className="flex items-center" style={{ color: routineTone(colorAccent) }}>
                            <EmojiMarkButton emoji={emoji} onChange={setEmoji} />
                            <ColourDot options={ROUTINE_SWATCHES} value={colorAccent} onChange={setColorAccent} label="Routine colour" />
                        </span>
                    )}
                />
                <DraftRow
                    applied={nlp.applied}
                    suggestions={nlp.suggestions}
                    shownElsewhere={["recurrence", "scheduled_start", "project", "tag"]}
                    literal={literal}
                    onDismiss={(id) => setDismissed((current) => [...current, id])}
                    onAccept={(id) => setAccepted((current) => [...current, id])}
                    onLiteral={setLiteral}
                />
                {title.trim() ? null : (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ideas">
                        {IDEAS.map((idea) => (
                            <button
                                key={idea.title}
                                type="button"
                                onClick={() => {
                                    setTitle(idea.title);
                                    setEmoji(idea.emoji);
                                    setColorAccent(idea.colorAccent);
                                    setDescription(idea.description);
                                    setRecurrenceRule(idea.recurrenceRule);
                                }}
                                className={`${CHIP_BASE} ${CHIP_IDLE} px-3`}
                            >
                                <span aria-hidden="true">{idea.emoji}</span>
                                {idea.title}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <span className={FIELD_LABEL}>Repeats</span>
                <CadencePicker value={recurrenceRule} onChange={setRecurrenceRule} />
            </div>

            <div className="space-y-3">
                <span className={FIELD_LABEL}>When</span>
                <ComposerTabs
                    ariaLabel="When"
                    options={[{ id: "any", label: "Any time" }, { id: "set", label: "At a set time" }]}
                    value={targetTime ? "set" : "any"}
                    onChange={(next) => setTargetTime(next === "set" ? (targetTime ?? DEFAULT_TIME) : null)}
                />
                {targetTime ? (
                    <>
                        <TimePicker value={targetTime} onChange={setTargetTime} icon={<Clock3 size={14} className="text-moonlit" />} />
                        <ComposerToggle
                            icon={Bell}
                            label="Remind me"
                            description="A nudge at this time. Missing it is fine."
                            checked={reminderEnabled}
                            onCheckedChange={setReminderEnabled}
                            ariaLabel="Remind me at this time"
                        />
                    </>
                ) : null}
            </div>

            <ComposerMore summary={moreSummary}>
                <div role="group" aria-label="Steps">
                    <span className={`mb-1 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                        <ListChecks size={12} aria-hidden="true" />
                        Steps
                    </span>
                    <RoutineStepsEditor steps={steps ?? []} onChange={setSteps} />
                </div>

                <label className="block">
                    <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                        <StickyNote size={12} aria-hidden="true" />
                        Purpose
                    </span>
                    <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={2}
                        placeholder="Why this routine matters to you…"
                        className={`${COMPOSER_FIELD} resize-y`}
                    />
                </label>

                <div role="group" aria-label="Times by day">
                    <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                        <CalendarClock size={12} aria-hidden="true" />
                        Times by day
                    </span>
                    <DayTimes value={targetTimes} usualTime={targetTime} onChange={setTargetTimes} />
                </div>

                <div>
                    {projects.length > 0 ? (
                        <FieldRow icon={FolderOpen} label="List">
                            <ValueSelect
                                label="List"
                                value={projectId ?? ""}
                                onChange={(id) => setProjectId(id || null)}
                                options={[{ value: "", label: "None" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
                            />
                        </FieldRow>
                    ) : null}
                    <FieldBlock icon={Tag} label="Tags">
                        <TagField
                            tagIds={tagIds}
                            onAdd={(id) => setTagIds((prev) => [...prev, id])}
                            onRemove={(id) => setTagIds((prev) => prev.filter((tagId) => tagId !== id))}
                        />
                    </FieldBlock>
                </div>
            </ComposerMore>
            </>
        ),
    };
}
