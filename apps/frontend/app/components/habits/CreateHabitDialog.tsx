import { useState } from "react";
import { Bell, CalendarClock, Clock3, Flame, FolderOpen, ListChecks, Repeat, StickyNote, Tag } from "lucide-react";
import { toast } from "sonner";
import { TimePicker } from "../primitives";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useProjects } from "../../hooks/projects/use-projects";
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
import { toISODate } from "../../lib/utils/date-format";
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

    const [title, setTitle] = useState("");
    const [emoji, setEmoji] = useState<string | null>(null);
    const [colorAccent, setColorAccent] = useState<string>(ROUTINE_DEFAULT_ACCENT);
    const [targetTimes, setTargetTimes] = useState<Record<string, string> | null>(null);
    const [recurrenceRule, setRecurrenceRule] = useState("FREQ=DAILY");
    const [targetTime, setTargetTime] = useState<string | null>(null);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [description, setDescription] = useState("");
    const [projectId, setProjectId] = useState<string | null>(null);
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [steps, setSteps] = useState<RoutineStep[] | null>(null);

    const isDirty = Boolean(title.trim() || emoji || colorAccent !== ROUTINE_DEFAULT_ACCENT || recurrenceRule !== "FREQ=DAILY" || targetTime || targetTimes || description.trim() || projectId || tagIds.length || steps);

    const reset = () => {
        setTitle("");
        setEmoji(null);
        setColorAccent(ROUTINE_DEFAULT_ACCENT);
        setTargetTimes(null);
        setRecurrenceRule("FREQ=DAILY");
        setTargetTime(null);
        setReminderEnabled(false);
        setDescription("");
        setProjectId(null);
        setTagIds([]);
        setSteps(null);
    };

    const submit = () => {
        const parsed = createHabitSchema.safeParse({
            title: title.trim(),
            description: description.trim() || undefined,
            recurrenceRule,
            colorAccent,
            targetTime,
            targetTimes,
            emoji,
            reminderEnabled: Boolean(targetTime) && reminderEnabled,
            projectId,
            tagIds: tagIds.length ? tagIds : undefined,
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
        scheduledStart: targetTime ? new Date(`${toISODate(new Date())}T${targetTime}:00`).toISOString() : null,
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
        footer: <ComposerSubmit onSubmit={submit} submitLabel={isPending ? "Creating…" : "Create routine"} icon={Repeat} tone="habits" disabled={!title.trim() || isPending} />,
        reset,
        children: (
            <>
            <div className="space-y-3">
                <ComposerTitle
                    autoFocus={!shell.isCompact}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && title.trim()) submit(); }}
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
