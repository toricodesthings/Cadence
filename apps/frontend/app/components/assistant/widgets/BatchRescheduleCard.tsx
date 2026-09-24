import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { ProposalCard, type ProposalCardState } from "./ProposalCard";
import { useProposalResolver, type ToolRenderContext } from "./use-proposal-resolver";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { unwrapResponse } from "../../../lib/api/helpers";
import { useTaskTitleLookup } from "./card-lookups";
import { parseLocalDate } from "../../../lib/utils/date-format";

function dayLabel(iso?: string): string {
    if (!iso) return "later";
    // A date-only target is a local day; `new Date("2026-09-22")` would be UTC midnight.
    const d = parseLocalDate(iso);
    if (Number.isNaN(d.getTime())) return "later";
    return d.toLocaleDateString(undefined, { weekday: "long" });
}

/**
 * Change-set card for `propose_batch_reschedule` (design §4.2). Load-reducing,
 * protective framing. Shows ≤4 affected items then a "+ N more" reveal; one
 * confirm moves the whole set to the local day, each task keeping its own time
 * (the server does it per task). Auto waits for a tap past 5 tasks.
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
    const client = useApiClient();
    const [expanded, setExpanded] = useState(false);

    const input = ctx.part?.input ?? {};
    const taskIds: string[] = input.taskIds ?? [];
    // A local day; older proposals may carry a time, which the day alone replaces.
    const targetDate: string | undefined = input.targetDate?.slice(0, 10);
    const day = dayLabel(targetDate);
    const count = taskIds.length;

    const { resolving, writeError, decision, confirm, discard } = useProposalResolver(ctx, async () => {
        const res = await client.api.tasks.batch.reschedule.$post({
            json: { taskIds, date: targetDate!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        });
        const moved = await unwrapResponse<unknown[]>(res);
        return { count: moved.length, targetDate };
    }, { size: count });

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
                    // Fixed blocks stay put, so the server's count is the honest one.
                    committed ? `Moved ${ctx.part?.output?.count ?? count} to ${day}.` : "Left them where they were."
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
