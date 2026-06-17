import React, { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { ProposalCard, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useBatchRescheduleTasks } from "../../../hooks/tasks/use-batch-state";
import { normalizeTaskWriteTemporalField } from "../../../lib/utils/task/task-scheduling";
import { useTaskTitleLookup } from "./card-lookups";

function dayLabel(iso?: string): string {
    if (!iso) return "later";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "later";
    return d.toLocaleDateString(undefined, { weekday: "long" });
}

/**
 * Change-set card for `propose_batch_reschedule` (design §4.2). Load-reducing,
 * protective framing. Shows ≤4 affected items then a "+ N more" reveal; one
 * confirm applies the whole set via the existing batch-reschedule hook.
 */
export function BatchRescheduleCard({
    ctx,
    state,
}: {
    ctx: ToolRenderContext;
    state: ProposalCardState;
}) {
    const persona = useAssistantPersona();
    const lookupTitle = useTaskTitleLookup();
    const reschedule = useBatchRescheduleTasks();
    const [expanded, setExpanded] = useState(false);

    const input = ctx.part?.input ?? {};
    const taskIds: string[] = input.taskIds ?? [];
    const targetDate: string | undefined = normalizeTaskWriteTemporalField(input.targetDate, "scheduledStart") ?? undefined;
    const day = dayLabel(targetDate);
    const count = taskIds.length;

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        await reschedule.mutateAsync({
            taskIds,
            scheduledStart: targetDate!,
            isAllDay: true,
        });
        return { count, targetDate };
    });

    const eyebrow = `RESCHEDULE ${count} ITEMS`;

    if (state === "output-available" || decision) {
        const committed = decision === "commit";
        return (
            <ProposalCard
                state="output-available"
                eyebrow={eyebrow}
                eyebrowGlyph={CalendarClock}
                ariaLabel={eyebrow}
                primaryLabel={`Move all to ${day}`}
                resolvedCommitted={committed}
                resolvedText={
                    committed ? `Moved ${count} to ${day}.` : "Left them where they were."
                }
            >
                {null}
            </ProposalCard>
        );
    }

    const visible = expanded ? taskIds : taskIds.slice(0, 4);
    const remaining = count - visible.length;

    return (
        <ProposalCard
            state={state}
            eyebrow={eyebrow}
            eyebrowGlyph={CalendarClock}
            ariaLabel={eyebrow}
            primaryLabel={`Move all to ${day}`}
            primaryGlyph={Check}
            resolving={resolving}
            writeError={writeError}
            onPrimary={() => void confirm()}
            onDecline={discard}
        >
            {persona.terse ? null : (
                <p className="text-xs text-twilight-text-soft">
                    Want me to push these to {day} so today’s lighter?
                </p>
            )}
            <div className="divide-y divide-twilight-border rounded-lg bg-twilight-deep/40 px-2.5 py-1.5">
                {visible.map((id) => (
                    <div key={id} className="flex items-center justify-between gap-2 py-1 text-[11px]">
                        <span className="text-truncate-safe min-w-0 flex-1 text-twilight-text-soft">
                            {lookupTitle(id)}
                        </span>
                        <span className="shrink-0 text-twilight-text-muted">→ {day}</span>
                    </div>
                ))}
            </div>
            {remaining > 0 ? (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="text-[11px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft cursor-pointer"
                >
                    + {remaining} more
                </button>
            ) : null}
        </ProposalCard>
    );
}
