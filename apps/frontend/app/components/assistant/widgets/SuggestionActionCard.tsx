import React, { useMemo } from "react";
import { Lightbulb, Check } from "lucide-react";
import { ProposalCard, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { unwrapResponse } from "../../../lib/api/helpers";

/**
 * Advisory card for `propose_suggestion_action` (design §4.6). Accept / Dismiss
 * a pending suggestion.
 *
 * There is no dedicated frontend suggestions hook, so — per ai_frontend.md §6.2 —
 * we call the typed Hono client directly (modeled on use-update-task.ts) with an
 * `Idempotency-Key`. The PATCH performs the write; the resolver's `addToolResult`
 * only reports the outcome to the model.
 */
export function SuggestionActionCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const client = useApiClient();
    const input = ctx.part?.input ?? {};
    const suggestionId: string = input.suggestionId ?? "";
    const action: "accept" | "dismiss" = input.action ?? "accept";
    const status = action === "accept" ? "ACCEPTED" : "DISMISSED";

    // Stable idempotency key for the lifetime of this card (reused on retry).
    const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        const res = await client.api.suggestions[":id"].$patch({
            param: { id: suggestionId },
            json: { status },
            header: { "Idempotency-Key": idempotencyKey },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        await unwrapResponse(res);
        return { suggestionId, status };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow="SUGGESTION"
                eyebrowGlyph={Lightbulb}
                ariaLabel="Suggestion"
                primaryLabel={action === "accept" ? "Accept" : "Dismiss"}
                resolvedCommitted={committed}
                resolvedText={committed ? (action === "accept" ? "Done." : "Dismissed.") : "Left as-is."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow="SUGGESTION"
            eyebrowGlyph={Lightbulb}
            ariaLabel="Suggestion"
            primaryLabel={action === "accept" ? "Accept" : "Dismiss"}
            primaryGlyph={Check}
            declineLabel={action === "accept" ? "Dismiss" : "Not now"}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <p className="text-xs text-twilight-text-soft">
                {action === "accept"
                    ? "Apply this suggestion?"
                    : "Dismiss this suggestion?"}
            </p>
        </ProposalCard>
    );
}
