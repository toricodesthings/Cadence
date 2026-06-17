import React from "react";
import { FolderPlus, Check } from "lucide-react";
import { ProposalCard, IdentityBlock, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useCreateProject } from "../../../hooks/projects/use-create-project";

/** Suggestion card for `propose_create_project` (design §4.1). */
export function CreateProjectCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const createProject = useCreateProject();
    const input = ctx.part?.input ?? {};
    const name = input.name ?? "this project";

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await createProject.mutateAsync({
            name: input.name,
            ...(input.emoji && { emoji: input.emoji }),
            ...(input.colorAccent && { colorAccent: input.colorAccent }),
        });
        return { name };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow="NEW PROJECT"
                eyebrowGlyph={FolderPlus}
                ariaLabel={`New project: ${name}`}
                primaryLabel="Create"
                resolvedCommitted={committed}
                resolvedText={committed ? `Created “${name}”.` : "Left as-is."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow="NEW PROJECT"
            eyebrowGlyph={FolderPlus}
            ariaLabel={`New project: ${name}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <IdentityBlock title={`${input.emoji ? `${input.emoji} ` : ""}${name}`} />
        </ProposalCard>
    );
}
