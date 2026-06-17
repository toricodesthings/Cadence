import React from "react";
import { CheckCircle2, Check } from "lucide-react";
import { ProposalCard, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useBatchStateTransition } from "../../../hooks/tasks/use-batch-state";
import { useTaskTitleLookup } from "./card-lookups";

/**
 * Complete-tasks card for `propose_complete_tasks` (design §4.5). Celebratory-
 * but-quiet — `feedback-success` tint, no confetti, no bounce. Confirm routes
 * through the existing batch-state hook (→ state COMPLETE).
 */
export function CompleteTasksCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const persona = useAssistantPersona();
    const lookupTitle = useTaskTitleLookup();
    const batchState = useBatchStateTransition();

    const input = ctx.part?.input ?? {};
    const taskIds: string[] = input.taskIds ?? [];
    const count = taskIds.length;

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await batchState.mutateAsync({ taskIds, state: "COMPLETE" });
        return { count };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                tone="success"
                eyebrow="MARK DONE"
                eyebrowGlyph={CheckCircle2}
                ariaLabel="Mark tasks done"
                primaryLabel={`Mark ${count} done`}
                resolvedCommitted={committed}
                resolvedText={committed ? `Marked ${count} done. Nice.` : "Left them open."}
            >
                {null}
            </ProposalCard>
        );
    }

    // Terse: collapse to a count when there are more than three.
    const showList = !(persona.terse && count > 3);

    return (
        <ProposalCard
            state={state}
            tone="success"
            eyebrow="MARK DONE"
            eyebrowGlyph={CheckCircle2}
            ariaLabel="Mark tasks done"
            primaryLabel={`Mark ${count} done`}
            primaryGlyph={Check}
            declineLabel="Not yet"
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            {showList ? (
                <div className="space-y-0.5 rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                    {taskIds.map((id) => (
                        <div key={id} className="flex items-center gap-1.5 py-0.5 text-[11px]">
                            <Check size={11} className="shrink-0 text-feedback-success" />
                            <span className="text-truncate-safe min-w-0 text-twilight-text-soft">
                                {lookupTitle(id)}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-twilight-text-soft">{count} tasks</p>
            )}
        </ProposalCard>
    );
}
