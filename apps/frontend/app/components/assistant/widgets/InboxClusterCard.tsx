import React from "react";
import { FolderPlus, Check } from "lucide-react";
import { ProposalCard, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useCreateProject } from "../../../hooks/projects/use-create-project";

/**
 * Change-set card for `propose_cluster_inbox` (design §4.2). Groups N captures
 * into a (possibly new) project.
 *
 * Confirm path: when the cluster targets a NEW project we create it through the
 * existing `useCreateProject()` hook (the project-create write a human uses).
 * When it targets an existing project there's no additive write to perform, so
 * we just report the decision back to the model (the captures' association is a
 * follow-on the user manages from the inbox). This keeps the one-validated-write
 * invariant: we never silently mutate.
 */
export function InboxClusterCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const persona = useAssistantPersona();
    const createProject = useCreateProject();
    const input = ctx.part?.input ?? {};
    const projectName: string = input.projectName ?? "a project";
    const existingProjectId: string | undefined = input.existingProjectId;
    const inboxItemIds: string[] = input.inboxItemIds ?? [];
    const count = inboxItemIds.length;

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        if (!existingProjectId) {
            await createProject.mutateAsync({ name: projectName });
        }
        return { projectName, count, existingProjectId: existingProjectId ?? null };
    });

    const eyebrow = `GROUP ${count} CAPTURES`;

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow={eyebrow}
                eyebrowGlyph={FolderPlus}
                ariaLabel={eyebrow}
                primaryLabel="Group them"
                resolvedCommitted={committed}
                resolvedText={
                    committed ? `Grouped ${count} into “${projectName}”.` : "Left them separate."
                }
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow={eyebrow}
            eyebrowGlyph={FolderPlus}
            ariaLabel={eyebrow}
            primaryLabel="Group them"
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            {persona.terse ? null : (
                <p className="text-xs text-twilight-text-soft">
                    Want me to gather these into one place?
                </p>
            )}
            <div className="rounded-lg bg-twilight-deep/40 px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-twilight-text-soft">{count} captures</span>
                    <span className="text-truncate-safe text-twilight-text-muted">
                        → “{projectName}”
                    </span>
                </div>
            </div>
        </ProposalCard>
    );
}
