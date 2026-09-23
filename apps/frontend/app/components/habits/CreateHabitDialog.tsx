import { useState } from "react";
import { Bell, Clock3, Flame, FolderOpen, Repeat, StickyNote, Tag } from "lucide-react";
import { toast } from "sonner";
import { TimePicker } from "../primitives";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { CadencePicker } from "./CadencePicker";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { Composer, type ComposerDraft, ComposerSubmit, ComposerMore, ComposerTabs, ComposerTitle, ComposerToggle, COMPOSER_FIELD } from "../shared/Composer";
import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, FIELD_LABEL } from "../tasks/task-choice-options";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { toISODate } from "../../lib/utils/date-format";
import type { Habit } from "@cadence/contracts/habit";
import { createHabitSchema } from "../../lib/validations/habit-schemas";

const IDEAS = [
    { emoji: "🌅", title: "Morning review", description: "Check Today, clear Holding, and start with intention.", recurrenceRule: "FREQ=DAILY" },
    { emoji: "🏋️", title: "Workout", description: "Keep a steady training rhythm across the week.", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" },
    { emoji: "💧", title: "Hydration", description: "A small daily reset that keeps the baseline healthy.", recurrenceRule: "FREQ=DAILY" },
    { emoji: "📚", title: "Reading", description: "A calm evening reading routine.", recurrenceRule: "FREQ=DAILY" },
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
    const { data: tags = [] } = useTags();

    const [title, setTitle] = useState("");
    const [emoji, setEmoji] = useState<string | null>(null);
    const [recurrenceRule, setRecurrenceRule] = useState("FREQ=DAILY");
    const [targetTime, setTargetTime] = useState<string | null>(null);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [description, setDescription] = useState("");
    const [projectId, setProjectId] = useState<string | null>(null);
    const [tagIds, setTagIds] = useState<string[]>([]);

    const isDirty = Boolean(title.trim() || emoji || recurrenceRule !== "FREQ=DAILY" || targetTime || description.trim() || projectId || tagIds.length);

    const reset = () => {
        setTitle("");
        setEmoji(null);
        setRecurrenceRule("FREQ=DAILY");
        setTargetTime(null);
        setReminderEnabled(false);
        setDescription("");
        setProjectId(null);
        setTagIds([]);
    };

    const submit = () => {
        const parsed = createHabitSchema.safeParse({
            title: title.trim(),
            description: description.trim() || undefined,
            recurrenceRule,
            colorAccent: "lantern",
            targetTime,
            emoji,
            reminderEnabled: Boolean(targetTime) && reminderEnabled,
            projectId,
            tagIds: tagIds.length ? tagIds : undefined,
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
    const moreSummary = [projectName, tagIds.length ? `${tagIds.length} tag${tagIds.length > 1 ? "s" : ""}` : null, description.trim() ? "purpose" : null]
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
                    leading={<EmojiMarkButton emoji={emoji} onChange={setEmoji} />}
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

                {projects.length > 0 ? (
                    <label className="block">
                        <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                            <FolderOpen size={12} aria-hidden="true" />
                            Project
                        </span>
                        <select
                            value={projectId ?? ""}
                            onChange={(event) => setProjectId(event.target.value || null)}
                            className={`${COMPOSER_FIELD} min-h-11 cursor-pointer`}
                        >
                            <option value="">None</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>{project.name}</option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {tags.length > 0 ? (
                    <div role="group" aria-label="Tags">
                        <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                            <Tag size={12} aria-hidden="true" />
                            Tags
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag) => {
                                const selected = tagIds.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => setTagIds((prev) => (selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))}
                                        className={`${CHIP_BASE} px-3 ${selected ? CHIP_ACTIVE : CHIP_IDLE}`}
                                    >
                                        {tag.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </ComposerMore>
            </>
        ),
    };
}
