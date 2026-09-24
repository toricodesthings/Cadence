/**
 * Shared confirm → write → report-back flow for proposal cards (ai_frontend.md §6.2).
 *
 * The HITL contract: the model only ever *proposes*; the app *commits* through
 * the same guarded REST endpoint a human uses. So a card's primary action runs
 * a REST write (via an existing domain hook or the typed client with an
 * Idempotency-Key), refreshes caches, and then calls `addToolResult` PURELY to
 * inform the model of the outcome — `addToolResult` does NOT trigger a server
 * mutation; the REST call already did the write.
 *
 * The card stays reload-safe by reading `part.output` when `output-available`:
 * a confirmed proposal renders locked and never re-offers the write. Creates
 * also send the tool call's id as their `Idempotency-Key`, so a card replayed
 * before its decision is saved returns the first write instead of a second one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hardRefreshWorkspaceCaches } from "../../../lib/api/workspace-cache";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import type { ApprovalMode } from "@cadence/contracts/ai";
import type { ProposalCardState } from "./ProposalCard";

/** Typed-enough context every proposal renderer receives (tool parts stay `any`). */
export interface ToolRenderContext {
    // Tool-part typing is pragmatic `any`, matching the existing card code; the
    // AI SDK's per-tool part types don't flow through our untyped registry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part: any;
    /** AI SDK helper to report the resolution back to the model. */
    addToolResult: (args: {
        tool: string;
        toolCallId: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output: any;
    }) => void;
    /** The backend tool name (e.g. "propose_create_task"). */
    toolName: string;
    /** Thread + message hosting this part — used to persist the decision server-side. */
    conversationId?: string | null;
    messageId?: string;
    /** The approval mode for this part: "ask" unless it streamed live from a turn this tab sent. */
    approvalMode?: ApprovalMode;
}

/** A write the card refused or the server turned down, with words the user should see. */
export class ProposalError extends Error {}

/** Map an AI SDK tool-part `state` to the ProposalCard's render state. */
export function partRenderState(part: { state?: string }): ProposalCardState {
    switch (part?.state) {
        case "input-streaming":
            return "input-streaming";
        case "output-available":
        case "output-error":
            return "output-available";
        default:
            return "input-available";
    }
}

/** Full applies everything. Auto applies all but permanent deletes and changes to more than 5 tasks. */
export function shouldAutoApply(mode: ApprovalMode | undefined, destructive: boolean, size = 1): boolean {
    return mode === "full" || (mode === "auto" && !destructive && size <= 5);
}

/**
 * Drive a proposal card's confirm/decline lifecycle.
 *
 * @param ctx           the render context (part + addToolResult + toolName)
 * @param performWrite  the REST write, given the proposal's idempotency key; resolves with a small result echoed to the model
 * @param destructive   removes something for good: Auto mode leaves it for a tap, only Full applies it
 * @param size          how many tasks it changes: Auto leaves more than 5 for a tap
 */
export function useProposalResolver(
    ctx: ToolRenderContext,
    performWrite: (idempotencyKey: string) => Promise<Record<string, unknown> | void>,
    { destructive = false, size = 1 }: { destructive?: boolean; size?: number } = {},
) {
    const queryClient = useQueryClient();
    const client = useApiClient();
    const { part, addToolResult, toolName, conversationId, messageId } = ctx;

    // Reload-safe: if the part is already resolved, read the settled decision.
    const persistedDecision: "commit" | "discard" | undefined = part?.output?.decision;

    const [resolving, setResolving] = useState(false);
    const [writeError, setWriteError] = useState<string | null>(null);
    // Local optimistic decision so the card collapses immediately after confirm,
    // before the persisted `output-available` round-trips back through the stream.
    const [localDecision, setLocalDecision] = useState<"commit" | "discard" | null>(null);

    const decision = persistedDecision ?? localDecision ?? null;

    // Persist the decision onto the stored assistant message (`addToolResult` is
    // client-local only). Without this, a reload re-offers an already-committed
    // proposal and the model never learns the outcome on later turns. Best-effort:
    // a failure never blocks the card (the REST write above is the real change).
    const persistDecision = useCallback(
        (output: Record<string, unknown>) => {
            const toolCallId: unknown = part?.toolCallId;
            if (!conversationId || !messageId || typeof toolCallId !== "string") return;
            void client.api.ai.conversations[":id"].messages[":messageId"]["tool-output"]
                .$post({
                    param: { id: conversationId, messageId },
                    json: { toolCallId, output },
                })
                .catch(() => {});
        },
        [client, conversationId, messageId, part?.toolCallId],
    );

    const confirm = useCallback(async () => {
        setResolving(true);
        setWriteError(null);
        try {
            const result = (await performWrite(part.toolCallId)) ?? {};
            // The real write already happened above; this only informs the model.
            await hardRefreshWorkspaceCaches(queryClient);
            const output = { decision: "commit", ...result };
            addToolResult({ tool: toolName, toolCallId: part.toolCallId, output });
            persistDecision(output);
            setLocalDecision("commit");
        } catch (err) {
            // Never a dead end (§3.3 E) — re-enable and offer a retry.
            setWriteError(err instanceof ProposalError ? err.message : "Couldn’t save that just now. Want to try again?");
        } finally {
            setResolving(false);
        }
    }, [performWrite, queryClient, addToolResult, toolName, part.toolCallId, persistDecision]);

    const discard = useCallback(() => {
        addToolResult({
            tool: toolName,
            toolCallId: part.toolCallId,
            output: { decision: "discard" },
        });
        persistDecision({ decision: "discard" });
        setLocalDecision("discard");
    }, [addToolResult, toolName, part?.toolCallId, persistDecision]);

    // Auto/Full: commit once, the moment the proposal is ready. Never retries on
    // its own — a failed write falls back to the card's normal "Try again".
    const autoApply = shouldAutoApply(ctx.approvalMode, destructive, size);
    const autoTried = useRef(false);
    useEffect(() => {
        if (!autoApply || autoTried.current || decision || part?.state !== "input-available") return;
        autoTried.current = true;
        void confirm();
    }, [autoApply, decision, part?.state, confirm]);

    return { resolving, writeError, decision, confirm, discard };
}
