/**
 * Load-by-id chat transport (ai_frontend.md §4.1).
 *
 * `DefaultChatTransport` re-sends the ENTIRE `messages[]` every turn by default
 * and carries no ids. We override `prepareSendMessagesRequest` so each turn
 * sends only:
 *   - the client-owned `conversationId` (minted with crypto.randomUUID on a new
 *     chat; the backend create-if-absent materializes it on the first turn),
 *   - the LAST message only (the backend reconstructs history from the DB) or,
 *     when that is the assistant's reply waiting on approvals, just the answers
 *     (the server applies them to its own stored copy and the turn continues),
 *   - a stable `clientMessageId` (idempotency token — reused verbatim on Retry so
 *     the server dedupes the user row),
 *   - a FRESH `new Date().toISOString()` per request — this fixes the stale-clock
 *     useMemo bug so "tomorrow"/"by Friday" resolve against the real current time.
 *
 * The `Idempotency-Key` header carries the same `clientMessageId`.
 */
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ToolApprovalDecision } from "@cadence/contracts/ai";
import { API_BASE_URL } from "../env";
import { useAssistantStore } from "../../stores/assistant-store";

/** The approval answers on an assistant reply (`addToolApprovalResponse` sets them). */
export function approvalAnswers(message: UIMessage): ToolApprovalDecision[] {
    return message.parts.flatMap((part) => {
        const p = part as { state?: string; approval?: { id: string; approved?: boolean; reason?: string } };
        if (p.state !== "approval-responded" || !p.approval) return [];
        const { id, approved = false, reason } = p.approval;
        return [{ id, approved, ...(reason && { reason }) }];
    });
}

/**
 * Build a load-by-id transport. The getters are read lazily on every send so the
 * panel can swap the active conversation / mint a fresh clientMessageId without
 * rebuilding the transport.
 *
 * @param getConversationId  current client-owned conversation UUID
 * @param getClientMessageId current idempotency token for the pending user turn
 * @param fetchImpl          the authenticated fetch wrapper (authenticatedFetch)
 */
export function makeChatTransport(
    getConversationId: () => string,
    getClientMessageId: () => string,
    fetchImpl: typeof fetch,
) {
    return new DefaultChatTransport({
        api: `${API_BASE_URL}/api/v1/ai/chat`,
        fetch: fetchImpl,
        // `body` carries per-send extras (e.g. the edit-truncation anchor passed
        // via sendMessage(msg, { body })); canonical fields below always win.
        prepareSendMessagesRequest: ({ messages, body }) => {
            const clientMessageId = getClientMessageId();
            const last = messages[messages.length - 1];
            return {
                body: {
                    ...(body as Record<string, unknown> | undefined),
                    conversationId: getConversationId(),
                    // load-by-id: only the latest message (or the approval answers); backend rebuilds history.
                    ...(last?.role === "assistant" ? { approvals: approvalAnswers(last) } : { message: last }),
                    clientMessageId,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    // FRESH per request — never a memoized clock.
                    currentDate: new Date().toISOString(),
                    // BCP-47 client locale → runtime prompt context ({{locale}}).
                    locale: typeof navigator !== "undefined" ? navigator.language : undefined,
                    // The composer's approval mode → the prompt's Environment.
                    approvalMode: useAssistantStore.getState().approvalMode,
                },
                headers: { "Idempotency-Key": clientMessageId },
            };
        },
    });
}
