/**
 * Cards for the single-item writes: `create_project`, `create_tag`, `log_habit`
 * and `structure_inbox_item` (design §4.1).
 */
import { FolderPlus, TagIcon, Repeat, Inbox, Check } from "lucide-react";
import { IdentityBlock } from "./ProposalCard";
import { ApprovalCard, type ToolRenderContext } from "./ApprovalCard";
import { DraftDetails, DraftNote, DraftQuotes, DraftSteps, type TaskDraft } from "./TaskBatchCard";
import { useHabitLookup } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
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
