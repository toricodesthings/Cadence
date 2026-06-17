import React from "react";
import { Repeat, Check } from "lucide-react";
import { ProposalCard, IdentityBlock, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useResolveHabit } from "../../../hooks/habits/use-resolve-habit";
import { useHabitTitleLookup } from "./card-lookups";
import type { HabitStatus } from "@cadence/contracts/habit";

/**
 * Suggestion card for `propose_log_habit` (design §4.1). Confirm routes through
 * the existing `useResolveHabit(habitId)` hook. The hook is keyed by habitId, so
 * we instantiate it from the proposal's habitId (stable for the card's lifetime).
 */
export function LogHabitCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const input = ctx.part?.input ?? {};
    const habitId: string = input.habitId ?? "";
    const status: HabitStatus = input.status ?? "COMPLETED";
    const targetDate: string = input.targetDate ?? "";

    const resolveHabit = useResolveHabit(habitId);
    const lookupTitle = useHabitTitleLookup();
    const habitName = lookupTitle(habitId);

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await resolveHabit.mutateAsync({ targetDate, status });
        return { habitId, status, targetDate };
    });

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow="LOG HABIT"
                eyebrowGlyph={Repeat}
                ariaLabel={`Log habit: ${habitName}`}
                primaryLabel="Log it"
                resolvedCommitted={committed}
                resolvedText={committed ? `Logged ${habitName} for today.` : "No worries — skipped."}
            >
                {null}
            </ProposalCard>
        );
    }

    return (
        <ProposalCard
            state={state}
            eyebrow="LOG HABIT"
            eyebrowGlyph={Repeat}
            ariaLabel={`Log habit: ${habitName}`}
            primaryLabel="Log it"
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            <IdentityBlock title={habitName} subtitle={status === "COMPLETED" ? "Mark complete" : status.toLowerCase()} />
        </ProposalCard>
    );
}
