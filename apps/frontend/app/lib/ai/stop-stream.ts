import type { UIMessage } from "ai";
import type { StopStreamRequest } from "@cadence/contracts/ai";
import { apiClient } from "../api/client";

export async function stopServerStream(
    conversationId: string,
    activeStreamId: string | null | undefined,
    lastMessage: UIMessage | undefined,
): Promise<void> {
    const body: StopStreamRequest = {
        activeStreamId: activeStreamId ?? undefined,
        assistantMessage:
            lastMessage?.role === "assistant" ? (lastMessage as StopStreamRequest["assistantMessage"]) : undefined,
    };

    await apiClient.api.ai.chat[":id"].stop.$post({ param: { id: conversationId }, json: body });
}
