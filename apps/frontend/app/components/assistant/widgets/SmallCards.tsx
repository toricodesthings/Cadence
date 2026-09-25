/**
 * Cards for the single-item writes: `create_project`, `create_tag`, `log_habit`,
 * `set_habit_emoji`, the event and section writes and `structure_inbox_item` (design §4.1).
 */
import { FolderPlus, TagIcon, Repeat, Inbox, Check, CalendarHeart, AlertCircle, Trash2, Columns3 } from "lucide-react";
import { IdentityBlock } from "./ProposalCard";
import { ApprovalCard, type ToolRenderContext } from "./ApprovalCard";
import { DraftDetails, DraftNote, DraftQuotes, DraftSteps, type TaskDraft } from "./TaskBatchCard";
import { useHabitLookup, useSectionLookup } from "./card-lookups";
import { TaskDestination } from "./TaskDestination";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useSettings } from "../../../hooks/core/use-settings";
import { formatShortDate } from "../../../lib/utils/date-format";
import { getNextPersonalEventDate } from "../../../lib/utils/personal-events";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";

export function CreateProjectCard({ ctx }: { ctx: ToolRenderContext }) {
    const input = ctx.part?.input ?? {};
    const name: string = input.name ?? "this list";
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
            <IdentityBlock title={`${input.emoji ? `${input.emoji} ` : ""}${name}`} />
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

export function SetHabitEmojiCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupHabit = useHabitLookup();
    const input = ctx.part?.input ?? {};
    const habitName = lookupHabit(input.habitId ?? "")?.title ?? ctx.part?.output?.title ?? "this routine";
    const emoji: string | null = input.emoji ?? null;
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="ROUTINE EMOJI"
            eyebrowGlyph={Repeat}
            ariaLabel={`Routine emoji: ${habitName}`}
            primaryLabel={emoji ? "Set it" : "Remove it"}
            primaryGlyph={Check}
            doneText={emoji ? `${emoji} ${habitName}.` : `Removed the emoji from ${habitName}.`}
        >
            <IdentityBlock title={`${emoji ? `${emoji} ` : ""}${habitName}`} subtitle={emoji ? "New mark" : "No emoji"} />
        </ApprovalCard>
    );
}

type EventDraft = { label?: string; monthDay?: string; emoji?: string | null; notify?: boolean; startedOn?: string | null };

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

/** Turns a capture into a task, with its checklist and note, in one transaction on the server. */
export function InboxStructureCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const draft = normalizeTaskWriteTemporalInput((ctx.part?.input ?? {}) as TaskDraft);
    const title = draft.title ?? "this capture";
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="STRUCTURE THIS CAPTURE"
            eyebrowGlyph={Inbox}
            ariaLabel={`Structure capture: ${title}`}
            primaryLabel="Make it a task"
            primaryGlyph={Check}
            doneText="Turned it into a task."
            declinedText="Left it in Capture."
        >
            <IdentityBlock title={title} subtitle={!persona.terse && draft.note ? <DraftNote note={draft.note} /> : undefined} />
            <DraftDetails draft={draft} />
            <DraftSteps draft={draft} />
            <DraftQuotes draft={draft} />
        </ApprovalCard>
    );
}
