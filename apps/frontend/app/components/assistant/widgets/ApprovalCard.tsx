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
import { AlertCircle, Check, Trash2 } from "lucide-react";
import type { ToolIO } from "@cadence/backend";
import type { ToolName } from "@cadence/contracts/ai-tools";
import { ProposalCard } from "./ProposalCard";

/** A tool's result when it ran (its `{ ok: false }` error and MCP's dedup echo left out). */
type ToolResult<N extends ToolName> = Exclude<ToolIO[N]["output"], { ok: false } | { deduped: true }>;

/**
 * A tool part as its card reads it. Fields may be missing while input streams, and
 * the result's fields are missing when the call failed (`ok: false`).
 */
export type ToolPartOf<N extends ToolName> = {
    state?: string;
    input?: Partial<ToolIO[N]["input"]>;
    output?: Partial<ToolResult<N>> & { ok?: boolean };
    approval?: { reason?: string };
};

/** What a card renderer receives, typed by its tool (`ToolIO` from the backend's tool registry). */
export interface ToolRenderContext<N extends ToolName = ToolName> {
    part: ToolPartOf<N>;
    /** The backend tool name, e.g. "create_tasks". */
    toolName: string;
    /** Answers this part's approval request; absent while a turn runs or on an older reply. */
    answer?: (approved: boolean, reason?: string) => void;
    /** On an older reply: anything still open there was never answered. */
    stale?: boolean;
    /** Sends the user's answer to an `ask_user` question as their next message; absent once the thread moved on. */
    reply?: (text: string) => void;
}

/** Cards for tools the server no longer offers: their parts have no current type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RetiredRenderContext = Omit<ToolRenderContext, "part"> & { part: any };

export type Outcome = "done" | "declined" | "failed" | "unanswered";

const WAITING_STATES = new Set(["input-available", "approval-requested", "approval-responded"]);

/** How a tool part ended, or null while it streams, waits or runs. */
type SettlingPart = { state?: string; output?: { ok?: boolean }; approval?: { reason?: string } };

export function outcomeOf(part: SettlingPart | undefined, stale = false): Outcome | null {
    const state = part?.state;
    if (state === "output-available") return part!.output?.ok === false ? "failed" : "done";
    if (state === "output-error") return "failed";
    if (state === "output-denied") return part!.approval?.reason === "Not answered" ? "unanswered" : "declined";
    // Streaming, waiting or running: an older reply's open call was never answered.
    return stale && WAITING_STATES.has(state ?? "") ? "unanswered" : null;
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
    ctx: ToolRenderContext | RetiredRenderContext;
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

type ApprovalCardProps = ComponentProps<typeof ApprovalCard>;

/** A permanent delete: danger framing, "Keep it" to decline. Auto mode still waits for this tap. */
export function DeleteApprovalCard({ primaryLabel = "Delete it", ...props }: Omit<ApprovalCardProps, "tone" | "eyebrowGlyph" | "primaryGlyph" | "primaryVariant" | "declineLabel" | "declinedText" | "primaryLabel"> & { primaryLabel?: string }) {
    return (
        <ApprovalCard
            tone="danger"
            eyebrowGlyph={AlertCircle}
            primaryLabel={primaryLabel}
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            declinedText="Kept it."
            {...props}
        />
    );
}

/**
 * Which rows of a batch card are unticked (by index). `onToggle(i)` is undefined
 * once the card can't be answered; `removed(labels)` picks the unticked ones.
 */
export function useUnticked(ctx: ToolRenderContext | RetiredRenderContext) {
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
