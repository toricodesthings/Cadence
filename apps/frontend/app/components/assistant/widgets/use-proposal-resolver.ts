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
 * a confirmed proposal renders locked and never re-offers the write (the REST
 * idempotency key is the backstop against a double-write).
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hardRefreshWorkspaceCaches } from "../../../lib/api/workspace-cache";
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
}

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

/**
 * Drive a proposal card's confirm/decline lifecycle.
 *
 * @param ctx           the render context (part + addToolResult + toolName)
 * @param performWrite  the REST write; resolves with a small result echoed to the model
 */
export function useProposalResolver(
    ctx: ToolRenderContext,
    performWrite: () => Promise<Record<string, unknown> | void>,
) {
    const queryClient = useQueryClient();
    const { part, addToolResult, toolName } = ctx;

    // Reload-safe: if the part is already resolved, read the settled decision.
    const persistedDecision: "commit" | "discard" | undefined = part?.output?.decision;

    const [resolving, setResolving] = useState(false);
    const [writeError, setWriteError] = useState<string | null>(null);
    // Local optimistic decision so the card collapses immediately after confirm,
    // before the persisted `output-available` round-trips back through the stream.
    const [localDecision, setLocalDecision] = useState<"commit" | "discard" | null>(null);

    const decision = persistedDecision ?? localDecision ?? null;

    const confirm = useCallback(async () => {
        setResolving(true);
        setWriteError(null);
        try {
            const result = (await performWrite()) ?? {};
            // The real write already happened above; this only informs the model.
            await hardRefreshWorkspaceCaches(queryClient);
            addToolResult({
                tool: toolName,
                toolCallId: part.toolCallId,
                output: { decision: "commit", ...result },
            });
            setLocalDecision("commit");
        } catch (err) {
            // Never a dead end (§3.3 E) — re-enable and offer a retry.
            setWriteError("Couldn’t save that just now. Want to try again?");
        } finally {
            setResolving(false);
        }
    }, [performWrite, queryClient, addToolResult, toolName, part?.toolCallId]);

    const discard = useCallback(() => {
        addToolResult({
            tool: toolName,
            toolCallId: part.toolCallId,
            output: { decision: "discard" },
        });
        setLocalDecision("discard");
    }, [addToolResult, toolName, part?.toolCallId]);

    return { resolving, writeError, decision, confirm, discard };
}
