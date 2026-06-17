import React from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import { ProposalCard, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useDeleteTask } from "../../../hooks/tasks/use-delete-task";

/**
 * Danger card for `propose_delete_task` (design §4.4). Calm and reversible-minded,
 * not alarmist — `feedback-error` framing (no raw red-500), no glow, the exact
 * title echoed so the deletion target is unambiguous (P4 explicit confirm).
 *
 * Confirm routes through the existing `useDeleteTask()` hook; `addToolResult`
 * (in the resolver) only reports the outcome to the model.
 */
export function DangerConfirmCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const persona = useAssistantPersona();
    const deleteTask = useDeleteTask();
    const input = ctx.part?.input ?? {};
    const title = input.title ?? "this task";

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await deleteTask.mutateAsync(input.taskId);
        return { title };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                tone="danger"
                eyebrow="DELETE TASK"
                eyebrowGlyph={AlertCircle}
                ariaLabel={`Delete task: ${title}`}
                primaryLabel="Delete it"
                resolvedCommitted={committed}
                resolvedText={committed ? `Deleted “${title}”.` : "Kept it."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            tone="danger"
            eyebrow="DELETE TASK"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete task: ${title}`}
            primaryLabel="Delete it"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <p className="text-xs text-twilight-text-soft">
                This removes “<span className="text-twilight-text">{title}</span>”.
                {persona.terse ? null : " It won’t come back."}
            </p>
        </ProposalCard>
    );
}
