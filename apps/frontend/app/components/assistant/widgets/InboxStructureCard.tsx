import { Inbox, Check } from "lucide-react";
import { ProposalCard, IdentityBlock, MetaPill, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { formatWhen } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useProcessInboxToTask } from "../../../hooks/inbox/use-process-inbox-to-task";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import { Calendar, Clock } from "lucide-react";
import { useNoteProposal } from "./note-proposal";

/**
 * Suggestion card for `propose_structure_inbox_item` (design §4.1). Turns a
 * messy capture into a task. Confirm routes through the existing atomic
 * inbox→task hook (`useProcessInboxToTask`) — the task is created and the
 * capture transitioned in one transaction. Everything the draft says is sent,
 * including "no date" as an explicit null, so the server never guesses a date
 * from the capture's text; the note follows through the note route.
 */
export function InboxStructureCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const persona = useAssistantPersona();
    const processInbox = useProcessInboxToTask();
    const input = normalizeTaskWriteTemporalInput(ctx.part?.input ?? {});
    const title = input.title ?? "this capture";
    const dateLabel = formatWhen(input.scheduledStart ?? input.dueDate);
    const notes = useNoteProposal(undefined, input);
    // A clock time means timed; a plain date (even one given as the start) means all-day.
    const timedStart = input.scheduledStart?.includes("T") ? input.scheduledStart : undefined;
    const day = input.dueDate ?? (timedStart ? undefined : input.scheduledStart);

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async (idempotencyKey) => {
        const created = await processInbox.mutateAsync({
            inboxItemId: input.inboxItemId,
            rawText: title,
            title,
            idempotencyKey,
            isAllDay: !timedStart,
            dueDate: day ? day.slice(0, 10) : null,
            scheduledStart: timedStart ?? null,
            ...(timedStart && input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
            ...(input.durationEstimate != null && { durationEstimate: input.durationEstimate }),
            ...(input.projectId && { projectId: input.projectId }),
            ...(input.tagIds?.length ? { tagIds: input.tagIds } : {}),
            ...(input.priority != null && { priority: input.priority }),
            ...(input.effort != null && { effort: input.effort }),
        });
        if (created?.id) await notes.write(created.id);
        return { title, taskId: created?.id };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow="STRUCTURE THIS CAPTURE"
                eyebrowGlyph={Inbox}
                ariaLabel={`Structure capture: ${title}`}
                primaryLabel="Make it a task"
                resolvedCommitted={committed}
                resolvedText={committed ? "Turned it into a task." : "Left it in your inbox."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow="STRUCTURE THIS CAPTURE"
            eyebrowGlyph={Inbox}
            ariaLabel={`Structure capture: ${title}`}
            primaryLabel="Make it a task"
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <IdentityBlock
                title={title}
                subtitle={!persona.terse && input.note ? input.note : undefined}
            />
            <div className="flex flex-wrap gap-1.5">
                {dateLabel ? <MetaPill icon={Calendar}>{dateLabel}</MetaPill> : null}
                {input.durationEstimate ? (
                    <MetaPill icon={Clock}>{input.durationEstimate}m block</MetaPill>
                ) : null}
            </div>
        </ProposalCard>
    );
}
