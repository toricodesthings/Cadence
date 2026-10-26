import { useState } from "react";
import { Bell, CalendarClock, Flame, FolderOpen, ListChecks, StickyNote, Tag } from "lucide-react";
import { toast } from "sonner";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useSettings } from "../../hooks/core/use-settings";
import { useNlpParse, type NlpParseOutput } from "../../hooks/use-nlp-parse";
import type { DraftField } from "@cadence/domain/nlp-draft";
import { DraftRow, useDraftChoices } from "../tasks/DraftRow";
import { CadencePicker } from "./CadencePicker";
import { DayTimes } from "./DayTimes";
import { ColourDot } from "../shared/ColourDot";
import { FieldBlock, FieldRow, ValueSelect } from "../shared/DetailPanelSections";
import { TagField } from "../tasks/TagField";
import { ROUTINE_DEFAULT_ACCENT, ROUTINE_SWATCHES, chosen, routineTone } from "../../lib/utils/habits";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { Composer, type ComposerDraft, ComposerSubmit, ComposerMore, ComposerTabs, ComposerTitle, ComposerToggle, COMPOSER_FIELD } from "../shared/Composer";
import { CHIP_BASE, CHIP_IDLE, FIELD_LABEL } from "../tasks/task-choice-options";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { fromTimeValue } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";
import type { Habit, RoutineStep } from "@cadence/contracts/habit";
import { RoutineStepsEditor } from "./RoutineSteps";
import { RoutineTimes } from "./RoutineTimes";
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
type RoutineChoices = {
    title: string;
    description: string;
    recurrenceRule: string;
    colorAccent: string;
    time: string | null;
    targetTimes: Record<string, string> | null;
    manyTimes: string[] | null;
    emoji: string | null;
    reminderEnabled: boolean;
    projectId: string | null;
    tagIds: string[];
    steps: RoutineStep[] | null;
};

/** The new routine as the API takes it: set times replace one time, per-day times and steps; a reminder needs a time. */
function routineInput(choice: RoutineChoices) {
    const many = choice.manyTimes;
    return {
        title: choice.title,
        description: choice.description.trim() || undefined,
        recurrenceRule: choice.recurrenceRule,
        colorAccent: choice.colorAccent,
        targetTime: many ? null : choice.time,
        targetTimes: many ? undefined : choice.targetTimes,
        times: many ?? undefined,
        emoji: choice.emoji,
        reminderEnabled: Boolean(choice.time) && choice.reminderEnabled,
        projectId: choice.projectId,
        tagIds: choice.tagIds.length ? choice.tagIds : undefined,
        steps: many ? undefined : choice.steps ?? undefined,
    };
}

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
    const choices = useDraftChoices();
    const { dismissed, accepted, literal } = choices;
    const [steps, setSteps] = useState<RoutineStep[] | null>(null);
    // Two or more daily times (a routine at set times); one time stays the usual `targetTime`.
    const [manyTimes, setManyTimes] = useState<string[] | null>(null);
    const [reminderTouched, setReminderTouched] = useState(false);

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
        enabled: intelligence?.nlpEnabled !== false,
    });
    const recurrenceRule = chosen(touched.has("recurrenceRule"), ruleState, nlp.fields.recurrenceRule);
    const targetTime = chosen(touched.has("timeOfDay"), timeState, nlp.fields.timeOfDay);
    const projectId = chosen(touched.has("projectId"), projectState, nlp.fields.projectId);
    const tagIds = chosen(touched.has("tagIds"), tagState, nlp.fields.tagIds.length ? nlp.fields.tagIds : null);
    const setRecurrenceRule = (rule: string) => { setRuleState(rule); touch("recurrenceRule"); };
    const setTargetTime = (time: string | null) => { setTimeState(time); setManyTimes(null); touch("timeOfDay"); };
    const timeList = manyTimes ?? (targetTime ? [targetTime] : []);
    const setTimeList = (list: string[]) => {
        if (list.length < 2) return setTargetTime(list[0] ?? null);
        setTimeState(list[0]);
        setManyTimes(list);
        touch("timeOfDay");
        if (!reminderTouched) setReminderEnabled(true); // a routine at set times reminds at each one
    };
    const setProjectId = (id: string | null) => { setProjectState(id); touch("projectId"); };
    const setTagIds = (update: string[] | ((prev: string[]) => string[])) => {
        setTagState(typeof update === "function" ? update(tagIds) : update);
        touch("tagIds");
    };

    const isDirty = Boolean(title.trim() || emoji || colorAccent !== ROUTINE_DEFAULT_ACCENT || recurrenceRule !== "FREQ=DAILY" || targetTime || manyTimes || targetTimes || description.trim() || projectId || tagIds.length || steps);

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
        setManyTimes(null);
        setReminderTouched(false);
        setTouched(new Set());
        choices.reset();
    };

    const submit = async () => {
        if (!title.trim() || isPending) return;
        // Enter saves what is on screen; only a still-loading parser makes it wait, then re-reads the same text.
        send(nlp.ready ? nlp : await nlp.finalize());
    };

    const send = (draft: NlpParseOutput) => {
        const { fields } = draft;
        const time = chosen(touched.has("timeOfDay"), timeState, fields.timeOfDay);
        const parsed = createHabitSchema.safeParse(routineInput({
            title: (draft.cleanedTitle || title).trim(),
            description,
            recurrenceRule: chosen(touched.has("recurrenceRule"), ruleState, fields.recurrenceRule),
            colorAccent,
            time,
            targetTimes,
            manyTimes,
            emoji,
            reminderEnabled,
            projectId: chosen(touched.has("projectId"), projectState, fields.projectId),
            tagIds: chosen(touched.has("tagIds"), tagState, fields.tagIds.length ? fields.tagIds : null),
            steps,
        }));
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
    const cadence = recurrenceRule === "FREQ=DAILY" ? "Every day" : (summary?.label ?? "Repeats");

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
        footer: <ComposerSubmit onSubmit={() => void submit()} submitLabel={isPending ? "Creating…" : "Create routine"} icon={Flame} tone="habits" disabled={!title.trim() || isPending} />,
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
                    {...choices.row}
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
                    options={[{ id: "any", label: "Any time" }, { id: "set", label: "At set times" }]}
                    value={targetTime ? "set" : "any"}
                    onChange={(next) => setTargetTime(next === "set" ? (targetTime ?? DEFAULT_TIME) : null)}
                />
                {targetTime ? (
                    <>
                        <RoutineTimes times={timeList} onChange={setTimeList} cadence={cadence} />
                        <ComposerToggle
                            icon={Bell}
                            label="Remind me"
                            description={timeList.length > 1 ? "At each time." : "A nudge at this time."}
                            checked={reminderEnabled}
                            onCheckedChange={(on) => { setReminderTouched(true); setReminderEnabled(on); }}
                            ariaLabel={timeList.length > 1 ? "Remind me at each time" : "Remind me at this time"}
                        />
                    </>
                ) : null}
            </div>

            <ComposerMore summary={moreSummary}>
                {manyTimes ? null : <div role="group" aria-label="Steps">
                    <span className={`mb-1 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                        <ListChecks size={12} aria-hidden="true" />
                        Steps
                    </span>
                    <RoutineStepsEditor steps={steps ?? []} onChange={setSteps} />
                </div>}

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

                {manyTimes ? null : <div role="group" aria-label="Times by day">
                    <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                        <CalendarClock size={12} aria-hidden="true" />
                        Times by day
                    </span>
                    <DayTimes value={targetTimes} usualTime={targetTime} onChange={setTargetTimes} />
                </div>}

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
