/**
 * Cards for the single-item writes: `create_project`, `create_tag`, `log_habit`,
 * and the routine, event and section writes (design §4.1).
 */
import { FolderPlus, TagIcon, Flame, Check, CalendarHeart, Columns3 } from "lucide-react";
import { IdentityBlock } from "./ProposalCard";
import { ApprovalCard, DeleteApprovalCard, type RetiredRenderContext, type ToolRenderContext } from "./ApprovalCard";
import { useHabitLookup, useSectionLookup, useTagsLookup } from "./card-lookups";
import { TaskDestination } from "./TaskDestination";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useSettings } from "../../../hooks/core/use-settings";
import { formatShortDate, formatTime } from "../../../lib/utils/date-format";
import { getTaskRecurrenceSummary } from "../../../lib/utils/task/task-scheduling";
import { getNextPersonalEventDate } from "../../../lib/utils/personal-events";

/** "🌱 Garden", or just the name. */
const withEmoji = (emoji: string | null | undefined, name: string) => (emoji ? `${emoji} ${name}` : name);
/** A routine's HH:MM in the viewer's clock format. */
const wallClock = (time: string) => formatTime(`2000-01-01T${time}:00`);
/** Copy for a switch the draft sets: on, off, or null when it leaves it alone. */
const switchCopy = (value: boolean | undefined, on: string, off: string) => (value === undefined ? null : value ? on : off);

export function CreateProjectCard({ ctx }: { ctx: ToolRenderContext<"create_project"> }) {
    const input = ctx.part?.input ?? {};
    const name: string = input.name ?? "this list";
    const sections: string[] = input.sections ?? [];
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="NEW LIST"
            eyebrowGlyph={FolderPlus}
            ariaLabel={`New list: ${name}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            doneText={`Created “${name}”.`}
        >
            <IdentityBlock
                title={withEmoji(input.emoji, name)}
                subtitle={sections.length ? `Sections: ${sections.join(" · ")}` : undefined}
            />
        </ApprovalCard>
    );
}

export function CreateTagCard({ ctx }: { ctx: ToolRenderContext<"create_tag"> }) {
    const name: string = ctx.part?.input?.name ?? "this tag";
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="NEW TAG"
            eyebrowGlyph={TagIcon}
            ariaLabel={`New tag: ${name}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            doneText={`Created #${name}.`}
        >
            <IdentityBlock title={`#${name}`} />
        </ApprovalCard>
    );
}

const LOG_COPY: Record<string, { done: string; ask: string }> = {
    COMPLETED: { done: "Done", ask: "Mark complete" },
    SKIPPED: { done: "Skipped", ask: "Skip" },
};

/** What logging does: the settled verb and the card's line ("Water ✓ · Stretch skipped" for steps). */
function logHabitText(input: { status?: string; time?: unknown; stepStatus?: Record<string, string> }, steps: { id: string; title: string }[]) {
    const marks = input.stepStatus;
    const copy = LOG_COPY[input.status ?? "COMPLETED"] ?? { done: "Cleared", ask: "Clear" };
    const at = typeof input.time === "string" ? ` at ${wallClock(input.time)}` : "";
    if (!marks) return { verb: copy.done + at, line: copy.ask + at };
    // Step marks, in the routine's order.
    const line = steps.filter((step) => marks[step.id]).map((step) => `${step.title} ${marks[step.id] === "SKIPPED" ? "skipped" : "✓"}`).join(" · ");
    return { verb: "Logged steps", line: line || "Clear every step" };
}

export function LogHabitCard({ ctx }: { ctx: ToolRenderContext<"log_habit"> }) {
    const lookupHabit = useHabitLookup();
    const input = ctx.part?.input ?? {};
    const habit = lookupHabit(input.habitId ?? "");
    const habitName = habit?.title ?? "this routine";
    const { verb, line } = logHabitText(input, habit?.steps ?? []);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="LOG ROUTINE"
            eyebrowGlyph={Flame}
            ariaLabel={`Log routine: ${habitName}`}
            primaryLabel="Log it"
            primaryGlyph={Check}
            doneText={`${verb}: ${habitName}.`}
            declinedText="No worries, left it."
        >
            <IdentityBlock title={habitName} subtitle={line} />
        </ApprovalCard>
    );
}

type RoutineDraft = {
    title?: string;
    recurrenceRule?: string;
    targetTime?: string | null;
    emoji?: string | null;
    description?: string | null;
    reminderEnabled?: boolean;
    steps?: (string | { title: string })[] | null;
    pausedUntil?: string | null;
    archived?: boolean;
    dayTimes?: Record<string, string> | null;
    times?: string[] | null;
    colorAccent?: string;
    projectId?: string | null;
    tagIds?: string[];
    position?: number;
};

const WEEKDAY_NAMES: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/** When it happens: set times, one usual time ("Any time" when cleared), and per-day times. */
function routineTimeParts(draft: RoutineDraft) {
    const times = draft.times?.length ? draft.times.map(wallClock).join(", ")
        : draft.targetTime ? wallClock(draft.targetTime) : draft.targetTime === null ? "Any time" : null;
    const dayTimes = draft.dayTimes
        ? Object.entries(draft.dayTimes).map(([day, time]) => `${WEEKDAY_NAMES[day] ?? day} ${time ? wallClock(time) : "any time"}`).join(", ")
        : draft.dayTimes === null ? "Same time every day" : null;
    return { times, dayTimes };
}

/** Its list, tags, place and emoji, when the draft changes them. */
function routinePlacementParts(draft: RoutineDraft, tagNames: string[]) {
    return [
        draft.colorAccent ? `Colour: ${draft.colorAccent}` : null,
        tagNames.length ? tagNames.map((tag) => `#${tag}`).join(" ") : draft.tagIds?.length === 0 ? "No tags" : null,
        draft.projectId === null ? "No list" : null,
        draft.position ? (draft.position === 1 ? "Moved to the top" : `Moved to place ${draft.position}`) : null,
        draft.emoji === null ? "No emoji" : null,
    ];
}

/** "Every weekday · 07:30 · 3 steps · reminder", from whatever the draft sets. */
function routineSummary(draft: RoutineDraft, tagNames: string[] = []) {
    const { times, dayTimes } = routineTimeParts(draft);
    const steps = draft.steps?.map((step) => (typeof step === "string" ? step : step.title)).join(" → ");
    return [
        draft.recurrenceRule ? getTaskRecurrenceSummary({ recurrenceRule: draft.recurrenceRule, scheduledStart: null, scheduledEnd: null })?.cadenceLabel ?? "Repeats" : null,
        times,
        draft.steps ? (draft.steps.length ? steps : "No steps") : null,
        switchCopy(draft.reminderEnabled, "Reminder on", "Reminder off"),
        draft.pausedUntil ? `Paused until ${formatShortDate(draft.pausedUntil)}` : draft.pausedUntil === null ? "Resumed" : null,
        switchCopy(draft.archived, "Archived", "Restored"),
        dayTimes,
        ...routinePlacementParts(draft, tagNames),
    ].filter(Boolean).join(" · ") || undefined;
}

export function CreateHabitCard({ ctx }: { ctx: ToolRenderContext<"create_habit"> }) {
    const lookupTags = useTagsLookup();
    const draft: RoutineDraft = ctx.part?.input ?? {};
    const name = draft.title ?? "this routine";
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="NEW ROUTINE"
            eyebrowGlyph={Flame}
            ariaLabel={`New routine: ${name}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            doneText={`Added “${name}” to Routines.`}
        >
            <IdentityBlock
                title={withEmoji(draft.emoji, name)}
                subtitle={routineSummary(draft, lookupTags(draft.tagIds ?? []).map((tag) => tag.name))}
            />
            {draft.projectId ? <div className="flex flex-wrap gap-1.5"><TaskDestination projectId={draft.projectId} /></div> : null}
            {draft.description ? <p className="text-xs text-twilight-text-soft">{draft.description}</p> : null}
        </ApprovalCard>
    );
}

/** What the routine change does; a bare rename or new emoji says so when nothing else changes. */
function habitChanges(patch: RoutineDraft, habit: { title: string } | undefined, tagNames: string[]) {
    const summary = routineSummary(patch, tagNames);
    if (summary) return summary;
    if (patch.title && habit && patch.title !== habit.title) return `Renamed from “${habit.title}”`;
    return patch.emoji ? "New emoji" : undefined;
}

/** The routine's name after the change, and its title with the emoji it will have. */
function habitCardTitle(patch: RoutineDraft, habit: { title: string; emoji?: string | null } | undefined, saved: string | undefined) {
    const name = patch.title ?? habit?.title ?? saved ?? "this routine";
    const emoji = "emoji" in patch ? patch.emoji : habit?.emoji;
    return { name, title: withEmoji(emoji, name) };
}

export function UpdateHabitCard({ ctx }: { ctx: ToolRenderContext<"update_habit"> }) {
    const lookupHabit = useHabitLookup();
    const lookupTags = useTagsLookup();
    const input = ctx.part?.input ?? {};
    const habit = lookupHabit(input.habitId ?? "");
    const patch: RoutineDraft = input.patch ?? {};
    const { name, title } = habitCardTitle(patch, habit, ctx.part?.output?.title);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE ROUTINE"
            eyebrowGlyph={Flame}
            ariaLabel={`Change routine: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated “${name}”.`}
        >
            <IdentityBlock
                title={title}
                subtitle={habitChanges(patch, habit, lookupTags(patch.tagIds ?? []).map((tag) => tag.name))}
            />
            {patch.description ? <p className="text-xs text-twilight-text-soft">{patch.description}</p> : null}
            {patch.projectId ? <div className="flex flex-wrap gap-1.5"><TaskDestination projectId={patch.projectId} /></div> : null}
        </ApprovalCard>
    );
}

/** `delete_habit` is permanent (history and streaks go too), so Auto still waits for this tap. */
export function DeleteHabitCard({ ctx }: { ctx: ToolRenderContext<"delete_habit"> }) {
    const persona = useAssistantPersona();
    const name: string = ctx.part?.input?.title ?? ctx.part?.output?.deleted ?? "this routine";
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow="DELETE ROUTINE"
            ariaLabel={`Delete routine: ${name}`}
            doneText={`Deleted “${name}” and its history.`}
        >
            <IdentityBlock title={name} tone="danger" />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">Its history and streaks go too. Archive keeps them.</p>}
        </DeleteApprovalCard>
    );
}

type EventDraft = { label?: string; monthDay?: string; emoji?: string | null; notify?: boolean; startedOn?: string | null; color?: string | null };

/** The event as it is now, from the settings cache. */
function useEventLookup() {
    const { data: settings } = useSettings();
    return (id: string) => settings?.calendar?.personalEvents?.items?.find((event) => event.id === id);
}

function eventTitle(draft: EventDraft, fallback: string) {
    return withEmoji(draft.emoji, draft.label ?? fallback);
}

function eventSubtitle(draft: EventDraft) {
    const parts = [
        draft.monthDay ? `Every ${formatShortDate(getNextPersonalEventDate({ monthDay: draft.monthDay }))}` : null,
        draft.startedOn ? `since ${draft.startedOn.slice(0, 4)}` : null,
        draft.notify === false ? "no reminder" : null,
        draft.color ? `colour: ${draft.color}` : draft.color === null ? "no colour" : null,
    ].filter(Boolean);
    return parts.join(" · ") || undefined;
}

export function CreateEventCard({ ctx }: { ctx: ToolRenderContext<"save_event"> | RetiredRenderContext }) {
    // Older threads hold create_event, whose fields sat at the top level.
    const draft: EventDraft = ctx.part?.input?.patch ?? ctx.part?.input ?? {};
    const title = eventTitle(draft, "this event");
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="NEW EVENT"
            eyebrowGlyph={CalendarHeart}
            ariaLabel={`New event: ${title}`}
            primaryLabel="Add it"
            primaryGlyph={Check}
            doneText={`Added “${draft.label ?? "the event"}” to Events.`}
        >
            <IdentityBlock title={title} subtitle={eventSubtitle(draft)} />
        </ApprovalCard>
    );
}

function eventName(patch: EventDraft, current: string | undefined, saved: string | undefined) {
    return patch.label ?? current ?? saved ?? "this event";
}

/** What the event change does; an emoji-only change says so. */
function eventChanges(patch: EventDraft) {
    const subtitle = eventSubtitle(patch);
    if (subtitle || !("emoji" in patch)) return subtitle;
    return patch.emoji ? "New emoji" : "No emoji";
}

export function UpdateEventCard({ ctx }: { ctx: ToolRenderContext<"save_event"> | RetiredRenderContext }) {
    const lookupEvent = useEventLookup();
    const input = ctx.part?.input ?? {};
    const current = lookupEvent(input.eventId ?? "");
    const patch: EventDraft = input.patch ?? {};
    const name = eventName(patch, current?.label, ctx.part?.output?.label);
    const emoji = "emoji" in patch ? patch.emoji : current?.emoji;
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE EVENT"
            eyebrowGlyph={CalendarHeart}
            ariaLabel={`Change event: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated “${name}”.`}
        >
            <IdentityBlock
                title={eventTitle({ label: name, emoji }, name)}
                subtitle={eventChanges(patch)}
            />
        </ApprovalCard>
    );
}

/** `delete_event` is permanent (events have no Trash), so Auto still waits for this tap. */
export function DeleteEventCard({ ctx }: { ctx: ToolRenderContext<"delete_event"> }) {
    const lookupEvent = useEventLookup();
    const name = lookupEvent(ctx.part?.input?.eventId ?? "")?.label ?? ctx.part?.output?.deleted ?? "this event";
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow="DELETE EVENT"
            ariaLabel={`Delete event: ${name}`}
            doneText={`Deleted “${name}”.`}
        >
            <IdentityBlock title={name} tone="danger" />
        </DeleteApprovalCard>
    );
}

export function CreateSectionsCard({ ctx }: { ctx: ToolRenderContext<"create_sections"> }) {
    const input = ctx.part?.input ?? {};
    const names: string[] = input.names ?? [];
    const label = names.length > 1 ? `${names.length} sections` : `“${names[0] ?? "a section"}”`;
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={names.length > 1 ? `NEW SECTIONS · ${names.length}` : "NEW SECTION"}
            eyebrowGlyph={Columns3}
            ariaLabel={`New sections: ${names.join(", ")}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            doneText={`Added ${label}.`}
        >
            <IdentityBlock title={names.join(" · ")} subtitle={input.projectId ? <TaskDestination projectId={input.projectId} /> : undefined} />
        </ApprovalCard>
    );
}

/** "Renamed from “Old” · Moved to the top" */
function sectionChanges(input: { name?: string; position?: number }, current: string) {
    return [
        input.name && input.name !== current ? `Renamed from “${current}”` : null,
        input.position ? (input.position === 1 ? "Moved to the top" : `Moved to position ${input.position}`) : null,
    ].filter(Boolean).join(" · ");
}

export function UpdateSectionCard({ ctx }: { ctx: ToolRenderContext<"update_section"> }) {
    const lookupSection = useSectionLookup();
    const input = ctx.part?.input ?? {};
    const current = lookupSection(input.sectionId ?? "")?.name ?? "this section";
    const name: string = input.name ?? current;
    const changes = sectionChanges(input, current);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE SECTION"
            eyebrowGlyph={Columns3}
            ariaLabel={`Change section: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated “${name}”.`}
        >
            <IdentityBlock title={name} subtitle={changes || undefined} />
        </ApprovalCard>
    );
}

/** `delete_section` is permanent; its tasks stay in the list, unsectioned. Auto still waits for this tap. */
export function DeleteSectionCard({ ctx }: { ctx: ToolRenderContext<"delete_section"> }) {
    const persona = useAssistantPersona();
    const lookupSection = useSectionLookup();
    const output = ctx.part?.output;
    const name = lookupSection(ctx.part?.input?.sectionId ?? "")?.name ?? output?.deleted ?? "this section";
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow="DELETE SECTION"
            ariaLabel={`Delete section: ${name}`}
            doneText={`Deleted “${name}”${output?.tasksUnsectioned ? `; ${output.tasksUnsectioned} tasks now have no section` : ""}.`}
        >
            <IdentityBlock title={name} tone="danger" />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">Its tasks stay in the list, with no section.</p>}
        </DeleteApprovalCard>
    );
}
