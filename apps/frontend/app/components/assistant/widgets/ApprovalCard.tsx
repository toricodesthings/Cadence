/**
 * Approval cards (design §6.2). Every assistant write runs on the server; a card
 * shows what the assistant wants to do and answers the server's approval request.
 * The server decides which calls wait (Ask; in Auto, deletes and big changes), so
 * a call that didn't wait arrives done and renders settled straight away.
 *
 * Unticking rows turns Approve into a decline that names them; the assistant
 * then proposes the rest again as a new card.
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import { Check } from "lucide-react";
import { ProposalCard } from "./ProposalCard";

/** What every card renderer receives (tool parts stay `any`, as the SDK's typing doesn't reach the registry). */
export interface ToolRenderContext {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any;
    /** The backend tool name, e.g. "create_tasks". */
    toolName: string;
    /** Answers this part's approval request; absent while a turn runs or on an older reply. */
    answer?: (approved: boolean, reason?: string) => void;
    /** On an older reply: anything still open there was never answered. */
    stale?: boolean;
}

export type Outcome = "done" | "declined" | "failed" | "unanswered";

/** How a tool part ended, or null while it streams, waits or runs. */
export function outcomeOf(
    part: { state?: string; output?: { ok?: boolean }; approval?: { reason?: string } } | undefined,
    stale = false,
): Outcome | null {
    switch (part?.state) {
        case "output-available":
            return part.output?.ok === false ? "failed" : "done";
        case "output-error":
            return "failed";
        case "output-denied":
            return part.approval?.reason === "Not answered" ? "unanswered" : "declined";
        case "input-available":
        case "approval-requested":
        case "approval-responded":
            return stale ? "unanswered" : null;
        default:
            return null;
    }
}

/** The reason sent with a decline when the user unticked some rows. */
export function removedReason(removed: string[]): string | undefined {
    return removed.length ? `User removed: ${removed.join("; ")}. Propose the rest again if still wanted.` : undefined;
}

type ShellProps = Omit<
    ComponentProps<typeof ProposalCard>,
    "state" | "resolving" | "writeError" | "resolvedCommitted" | "resolvedText" | "onPrimary" | "onDecline"
>;

export function ApprovalCard({
    ctx,
    doneText,
    declinedText = "Left as is.",
    removed = [],
    children,
    ...shell
}: ShellProps & {
    ctx: ToolRenderContext;
    /** Settled text once it ran. */
    doneText: string;
    declinedText?: string;
    /** Labels of rows the user unticked. */
    removed?: string[];
}) {
    const { part, answer, stale } = ctx;
    const outcome = outcomeOf(part, stale);

    if (outcome) {
        const text = { done: doneText, declined: declinedText, failed: "That didn’t go through.", unanswered: "Not answered." }[outcome];
        return (
            <ProposalCard {...shell} state="output-available" resolvedCommitted={outcome === "done"} resolvedText={text}>
                {null}
            </ProposalCard>
        );
    }

    const waiting = part?.state === "approval-requested" && !!answer;
    return (
        <ProposalCard
            {...shell}
            state={part?.state === "input-streaming" ? "input-streaming" : "input-available"}
            resolving={!waiting}
            onPrimary={() => answer?.(removed.length === 0, removedReason(removed))}
            onDecline={() => answer?.(false)}
        >
            {children}
        </ProposalCard>
    );
}

/**
 * Which rows of a batch card are unticked (by index). `onToggle(i)` is undefined
 * once the card can't be answered; `removed(labels)` picks the unticked ones.
 */
export function useUnticked(ctx: ToolRenderContext) {
    const [off, setOff] = useState<ReadonlySet<number>>(new Set());
    const onToggle = (index: number) =>
        ctx.answer
            ? () =>
                  setOff((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(index)) next.add(index);
                      return next;
                  })
            : undefined;
    const removed = (labels: string[]) => labels.filter((_, i) => off.has(i));
    return { off, onToggle, removed };
}

/** One row of a batch card, with a tick the user can clear before approving. */
export function TickRow({
    on,
    onToggle,
    label,
    children,
}: {
    on: boolean;
    onToggle?: () => void;
    /** What the row is, for screen readers. */
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-start gap-1.5 py-0.5 text-[11px]">
            <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={label}
                disabled={!onToggle}
                onClick={onToggle}
                className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                    on ? "border-accent-primary bg-accent-primary/20 text-accent-primary" : "border-twilight-border text-transparent"
                } ${onToggle ? "cursor-pointer" : ""}`}
            >
                <Check size={9} strokeWidth={3} aria-hidden="true" />
            </button>
            <div className={`min-w-0 flex-1 ${on ? "text-twilight-text-soft" : "text-twilight-text-muted line-through"}`}>{children}</div>
        </div>
    );
}
