import { DefaultChatTransport, type UIMessage } from "ai";
import type { ToolApprovalDecision } from "@cadence/contracts/ai";
import { API_BASE_URL } from "../env";
import { getUserZone } from "../utils/user-zone";
import { useAssistantStore } from "../../stores/assistant-store";

export function approvalAnswers(message: UIMessage): ToolApprovalDecision[] {
    return message.parts.flatMap((part) => {
        const p = part as { state?: string; approval?: { id: string; approved?: boolean; reason?: string } };
        if (p.state !== "approval-responded" || !p.approval) return [];
        const { id, approved = false, reason } = p.approval;
        return [{ id, approved, ...(reason && { reason }) }];
    });
}

export function makeChatTransport(
    getConversationId: () => string,
    getClientMessageId: () => string,
    fetchImpl: typeof fetch,
) {
    return new DefaultChatTransport({
        api: `${API_BASE_URL}/api/v1/ai/chat`,
        fetch: fetchImpl,
        prepareSendMessagesRequest: ({ messages, body }) => {
            const clientMessageId = getClientMessageId();
            const last = messages[messages.length - 1];
            return {
                body: {
                    ...(body as Record<string, unknown> | undefined),
                    conversationId: getConversationId(),
                    ...(last?.role === "assistant" ? { approvals: approvalAnswers(last) } : { message: last }),
                    clientMessageId,
                    timezone: getUserZone(),
                    currentDate: new Date().toISOString(),
                    locale: typeof navigator !== "undefined" ? navigator.language : undefined,
                    approvalMode: useAssistantStore.getState().approvalMode,
                    surface: useAssistantStore.getState().surface ?? undefined,
                },
                headers: { "Idempotency-Key": clientMessageId },
            };
        },
    });
}
