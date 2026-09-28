/**
 * Cards for the single-item writes: `create_project`, `create_tag`, `log_habit`,
 * and the routine, event and section writes (design §4.1).
 */
import { FolderPlus, TagIcon, Repeat, Check, CalendarHeart, AlertCircle, Trash2, Columns3 } from "lucide-react";
import { IdentityBlock } from "./ProposalCard";
import { ApprovalCard, type ToolRenderContext } from "./ApprovalCard";
import { useHabitLookup, useSectionLookup, useTagsLookup } from "./card-lookups";
import { TaskDestination } from "./TaskDestination";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useSettings } from "../../../hooks/core/use-settings";
import { formatShortDate, formatTime } from "../../../lib/utils/date-format";
import { getTaskRecurrenceSummary } from "../../../lib/utils/task/task-scheduling";
import { getNextPersonalEventDate } from "../../../lib/utils/personal-events";

export function CreateProjectCard({ ctx }: { ctx: ToolRenderContext }) {
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
                title={`${input.emoji ? `${input.emoji} ` : ""}${name}`}
                subtitle={sections.length ? `Sections: ${sections.join(" · ")}` : undefined}
            />
        </ApprovalCard>
    );
}

export function CreateTagCard({ ctx }: { ctx: ToolRenderContext }) {
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

export function LogHabitCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupHabit = useHabitLookup();
    const input = ctx.part?.input ?? {};
    const habit = lookupHabit(input.habitId ?? "");
    const habitName = habit?.title ?? "this routine";
    const marks: Record<string, string> | undefined = input.stepStatus;
    const status: string = input.status ?? "COMPLETED";
    const verb = marks ? "Logged steps" : status === "COMPLETED" ? "Done" : status === "SKIPPED" ? "Skipped" : "Cleared";
    // Step marks, in the routine's order: "Water ✓ · Stretch skipped".
    const stepLine = marks
        ? (habit?.steps ?? []).filter((step) => marks[step.id]).map((step) => `${step.title} ${marks[step.id] === "SKIPPED" ? "skipped" : "✓"}`).join(" · ") || "Clear every step"
        : null;
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="LOG ROUTINE"
            eyebrowGlyph={Repeat}
            ariaLabel={`Log routine: ${habitName}`}
            primaryLabel="Log it"
            primaryGlyph={Check}
            doneText={`${verb}: ${habitName}.`}
            declinedText="No worries, left it."
        >
            <IdentityBlock title={habitName} subtitle={stepLine ?? (status === "COMPLETED" ? "Mark complete" : status === "SKIPPED" ? "Skip" : "Clear")} />
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
    colorAccent?: string;
    projectId?: string | null;
    tagIds?: string[];
    position?: number;
};

const WEEKDAY_NAMES: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/** "Every weekday · 07:30 · 3 steps · reminder", from whatever the draft sets. */
function routineSummary(draft: RoutineDraft, tagNames: string[] = []) {
    return [
        draft.recurrenceRule ? getTaskRecurrenceSummary({ recurrenceRule: draft.recurrenceRule, scheduledStart: null, scheduledEnd: null })?.cadenceLabel ?? "Repeats" : null,
        draft.targetTime ? formatTime(`2000-01-01T${draft.targetTime}:00`) : draft.targetTime === null ? "Any time" : null,
        draft.steps ? (draft.steps.length ? draft.steps.map((step) => (typeof step === "string" ? step : step.title)).join(" → ") : "No steps") : null,
        draft.reminderEnabled === true ? "Reminder on" : draft.reminderEnabled === false ? "Reminder off" : null,
        draft.pausedUntil ? `Paused until ${formatShortDate(draft.pausedUntil)}` : draft.pausedUntil === null ? "Resumed" : null,
        draft.archived === true ? "Archived" : draft.archived === false ? "Restored" : null,
        draft.dayTimes ? Object.entries(draft.dayTimes).map(([day, time]) => `${WEEKDAY_NAMES[day] ?? day} ${time ? formatTime(`2000-01-01T${time}:00`) : "any time"}`).join(", ")
            : draft.dayTimes === null ? "Same time every day" : null,
        draft.colorAccent ? `Colour: ${draft.colorAccent}` : null,
        tagNames.length ? tagNames.map((tag) => `#${tag}`).join(" ") : draft.tagIds?.length === 0 ? "No tags" : null,
        draft.projectId === null ? "No list" : null,
        draft.position ? (draft.position === 1 ? "Moved to the top" : `Moved to place ${draft.position}`) : null,
        draft.emoji === null ? "No emoji" : null,
    ].filter(Boolean).join(" · ") || undefined;
}

export function CreateHabitCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupTags = useTagsLookup();
    const draft: RoutineDraft = ctx.part?.input ?? {};
    const name = draft.title ?? "this routine";
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="NEW ROUTINE"
            eyebrowGlyph={Repeat}
            ariaLabel={`New routine: ${name}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            doneText={`Added “${name}” to Routines.`}
        >
            <IdentityBlock
                title={`${draft.emoji ? `${draft.emoji} ` : ""}${name}`}
                subtitle={routineSummary(draft, lookupTags(draft.tagIds ?? []).map((tag) => tag.name))}
            />
            {draft.projectId ? <div className="flex flex-wrap gap-1.5"><TaskDestination projectId={draft.projectId} /></div> : null}
            {draft.description ? <p className="text-xs text-twilight-text-soft">{draft.description}</p> : null}
        </ApprovalCard>
    );
}

export function UpdateHabitCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupHabit = useHabitLookup();
    const lookupTags = useTagsLookup();
    const input = ctx.part?.input ?? {};
    const habit = lookupHabit(input.habitId ?? "");
    const patch: RoutineDraft = input.patch ?? {};
    const name = patch.title ?? habit?.title ?? ctx.part?.output?.title ?? "this routine";
    const emoji = "emoji" in patch ? patch.emoji : habit?.emoji;
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE ROUTINE"
            eyebrowGlyph={Repeat}
            ariaLabel={`Change routine: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated “${name}”.`}
        >
            <IdentityBlock
                title={`${emoji ? `${emoji} ` : ""}${name}`}
                subtitle={routineSummary(patch, lookupTags(patch.tagIds ?? []).map((tag) => tag.name)) ?? (patch.title && habit && patch.title !== habit.title ? `Renamed from “${habit.title}”` : patch.emoji ? "New emoji" : undefined)}
            />
            {patch.description ? <p className="text-xs text-twilight-text-soft">{patch.description}</p> : null}
            {patch.projectId ? <div className="flex flex-wrap gap-1.5"><TaskDestination projectId={patch.projectId} /></div> : null}
        </ApprovalCard>
    );
}

/** `delete_habit` is permanent (history and streaks go too), so Auto still waits for this tap. */
export function DeleteHabitCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const name: string = ctx.part?.input?.title ?? ctx.part?.output?.deleted ?? "this routine";
    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow="DELETE ROUTINE"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete routine: ${name}`}
            primaryLabel="Delete it"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            doneText={`Deleted “${name}” and its history.`}
            declinedText="Kept it."
        >
            <IdentityBlock title={name} tone="danger" />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">Its history and streaks go too. Archive keeps them.</p>}
        </ApprovalCard>
    );
}

type EventDraft = { label?: string; monthDay?: string; emoji?: string | null; notify?: boolean; startedOn?: string | null; color?: string | null };

/** The event as it is now, from the settings cache. */
function useEventLookup() {
    const { data: settings } = useSettings();
    return (id: string) => settings?.calendar?.personalEvents?.items?.find((event) => event.id === id);
}

function eventTitle(draft: EventDraft, fallback: string) {
    return `${draft.emoji ? `${draft.emoji} ` : ""}${draft.label ?? fallback}`;
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

export function CreateEventCard({ ctx }: { ctx: ToolRenderContext }) {
    const draft: EventDraft = ctx.part?.input ?? {};
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

export function UpdateEventCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupEvent = useEventLookup();
    const input = ctx.part?.input ?? {};
    const current = lookupEvent(input.eventId ?? "");
    const patch: EventDraft = input.patch ?? {};
    const name = patch.label ?? current?.label ?? ctx.part?.output?.label ?? "this event";
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
                subtitle={eventSubtitle(patch) ?? ("emoji" in patch ? (patch.emoji ? "New emoji" : "No emoji") : undefined)}
            />
        </ApprovalCard>
    );
}

/** `delete_event` is permanent (events have no Trash), so Auto still waits for this tap. */
export function DeleteEventCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupEvent = useEventLookup();
    const name = lookupEvent(ctx.part?.input?.eventId ?? "")?.label ?? ctx.part?.output?.deleted ?? "this event";
    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow="DELETE EVENT"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete event: ${name}`}
            primaryLabel="Delete it"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            doneText={`Deleted “${name}”.`}
            declinedText="Kept it."
        >
            <IdentityBlock title={name} tone="danger" />
        </ApprovalCard>
    );
}

export function CreateSectionsCard({ ctx }: { ctx: ToolRenderContext }) {
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

export function UpdateSectionCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupSection = useSectionLookup();
    const input = ctx.part?.input ?? {};
    const current = lookupSection(input.sectionId ?? "")?.name ?? "this section";
    const name: string = input.name ?? current;
    const changes = [
        input.name && input.name !== current ? `Renamed from “${current}”` : null,
        input.position ? (input.position === 1 ? "Moved to the top" : `Moved to position ${input.position}`) : null,
    ].filter(Boolean).join(" · ");
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
export function DeleteSectionCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const lookupSection = useSectionLookup();
    const output = ctx.part?.output;
    const name = lookupSection(ctx.part?.input?.sectionId ?? "")?.name ?? output?.deleted ?? "this section";
    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow="DELETE SECTION"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete section: ${name}`}
            primaryLabel="Delete it"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            doneText={`Deleted “${name}”${output?.tasksUnsectioned ? `; ${output.tasksUnsectioned} tasks now have no section` : ""}.`}
            declinedText="Kept it."
        >
            <IdentityBlock title={name} tone="danger" />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">Its tasks stay in the list, with no section.</p>}
        </ApprovalCard>
    );
}
