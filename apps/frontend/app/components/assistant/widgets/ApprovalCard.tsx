import { useState, type ComponentProps, type ReactNode } from "react";
import { CircleAlert, Check, Trash2 } from "lucide-react";
import type { ToolIO } from "@cadence/backend";
import type { ToolName } from "@cadence/contracts/ai-tools";
import { ProposalCard } from "./ProposalCard";

type ToolResult<N extends ToolName> = Exclude<ToolIO[N]["output"], { ok: false } | { deduped: true }>;

export type ToolPartOf<N extends ToolName> = {
    state?: string;
    input?: Partial<ToolIO[N]["input"]>;
    output?: Partial<ToolResult<N>> & { ok?: boolean };
    approval?: { reason?: string };
};

export interface ToolRenderContext<N extends ToolName = ToolName> {
    part: ToolPartOf<N>;
    toolName: string;
    answer?: (approved: boolean, reason?: string) => void;
    stale?: boolean;
    reply?: (text: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RetiredRenderContext = Omit<ToolRenderContext, "part"> & { part: any };

export type Outcome = "done" | "declined" | "failed" | "unanswered";

const WAITING_STATES = new Set(["input-available", "approval-requested", "approval-responded"]);

type SettlingPart = { state?: string; output?: { ok?: boolean }; approval?: { reason?: string } };

export function outcomeOf(part: SettlingPart | undefined, stale = false): Outcome | null {
    const state = part?.state;
    if (state === "output-available") return part!.output?.ok === false ? "failed" : "done";
    if (state === "output-error") return "failed";
    if (state === "output-denied") return part!.approval?.reason === "Not answered" ? "unanswered" : "declined";
    return stale && WAITING_STATES.has(state ?? "") ? "unanswered" : null;
}

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
    doneText: string;
    declinedText?: string;
    removed?: string[];
}) {
    const { part, answer, stale } = ctx;
    const outcome = outcomeOf(part, stale);

    if (outcome) {
        const text = {
            done: doneText,
            declined: declinedText,
            failed: "That didn’t go through.",
            unanswered: "Not answered.",
        }[outcome];
        return (
            <ProposalCard
                {...shell}
                state="output-available"
                resolvedCommitted={outcome === "done"}
                resolvedText={text}
            >
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

export function DeleteApprovalCard({
    primaryLabel = "Delete it",
    ...props
}: Omit<
    ApprovalCardProps,
    "tone" | "eyebrowGlyph" | "primaryGlyph" | "primaryVariant" | "declineLabel" | "declinedText" | "primaryLabel"
> & { primaryLabel?: string }) {
    return (
        <ApprovalCard
            tone="danger"
            eyebrowGlyph={CircleAlert}
            primaryLabel={primaryLabel}
            primaryGlyph={Trash2}
            primaryVariant="danger"
            declineLabel="Keep it"
            declinedText="Kept it."
            {...props}
        />
    );
}

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

export function TickRow({
    on,
    onToggle,
    label,
    children,
}: {
    on: boolean;
    onToggle?: () => void;
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
                    on
                        ? "border-accent-primary bg-accent-primary/20 text-accent-primary"
                        : "border-twilight-border text-transparent"
                } ${onToggle ? "cursor-pointer" : ""}`}
            >
                <Check size={9} strokeWidth={3} aria-hidden="true" />
            </button>
            <div
                className={`min-w-0 flex-1 ${on ? "text-twilight-text-soft" : "text-twilight-text-muted line-through"}`}
            >
                {children}
            </div>
        </div>
    );
}
