import React from "react";
import { TagIcon, Check } from "lucide-react";
import { ProposalCard, IdentityBlock, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useCreateTag } from "../../../hooks/tags/use-create-tag";

/** Suggestion card for `propose_create_tag` (design §4.1). */
export function CreateTagCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const createTag = useCreateTag();
    const input = ctx.part?.input ?? {};
    const name = input.name ?? "this tag";

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await createTag.mutateAsync({
            name: input.name,
            ...(input.color && { color: input.color }),
        });
        return { name };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow="NEW TAG"
                eyebrowGlyph={TagIcon}
                ariaLabel={`New tag: ${name}`}
                primaryLabel="Create"
                resolvedCommitted={committed}
                resolvedText={committed ? `Added the “${name}” tag.` : "Left as-is."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow="NEW TAG"
            eyebrowGlyph={TagIcon}
            ariaLabel={`New tag: ${name}`}
            primaryLabel="Create"
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <IdentityBlock title={name} />
        </ProposalCard>
    );
}
