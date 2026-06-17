import React from "react";
import { Inbox, Check } from "lucide-react";
import { ProposalCard, IdentityBlock, MetaPill, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useProcessInboxToTask } from "../../../hooks/inbox/use-process-inbox-to-task";
import { normalizeTaskWriteTemporalInput } from "../../../lib/utils/task/task-scheduling";
import { Calendar, Clock } from "lucide-react";

function formatDate(iso?: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Suggestion card for `propose_structure_inbox_item` (design §4.1). Turns a
 * messy capture into a task. Confirm routes through the existing atomic
 * inbox→task hook (`useProcessInboxToTask`) — the task is created and the
 * capture transitioned in one transaction.
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
    const dateLabel = formatDate(input.scheduledStart ?? input.dueDate);

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await processInbox.mutateAsync({
            inboxItemId: input.inboxItemId,
            rawText: title,
            title,
            ...(input.dueDate && { dueDate: input.dueDate }),
            ...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
            ...(input.durationEstimate != null && { durationEstimate: input.durationEstimate }),
            ...(input.projectId && { projectId: input.projectId }),
            ...(input.tagIds?.length ? { tagIds: input.tagIds } : {}),
        });
        return { title };
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
                subtitle={!persona.terse && input.content ? input.content : undefined}
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
