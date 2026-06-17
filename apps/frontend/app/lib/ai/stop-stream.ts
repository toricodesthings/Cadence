/**
 * Hard-abort an in-flight AI turn (doc Update 4 §7.9 / §8).
 *
 * The Stop control calls THIS first, then `chat.stop()`. That ordering is the
 * whole point: hitting the server stop endpoint sets a cross-isolate abort flag
 * that actually cancels the upstream model fetch + tool loop (a real hard abort),
 * whereas `chat.stop()` alone only tears down the local request (a pseudo-cancel
 * that leaves the server generating + billing tokens).
 *
 * Endpoint: `POST {API}/api/v1/ai/chat/:conversationId/stop` with a body matching
 * `stopStreamSchema` from `@cadence/contracts/ai`:
 *   - `activeStreamId` (from `GET /conversations/:id`) guards against stopping a
 *     newer turn the client doesn't yet know about; the server no-ops on mismatch.
 *   - `assistantMessage` is the last message IFF it's the in-flight assistant turn,
 *     so a refresh before the producer's own `onFinish` lands still shows the partial.
 *
 * Best-effort: any failure is swallowed by the caller so UI teardown still runs.
 */
import type { UIMessage } from "ai";
import type { StopStreamRequest } from "@cadence/contracts/ai";
import { API_BASE_URL } from "../env";
import { authenticatedFetch } from "../api/client";

/**
 * Send the server-side hard-abort request for a conversation's live turn.
 *
 * @param conversationId  the conversation whose in-flight turn to stop
 * @param activeStreamId  the live stream id hydrated from `GET /conversations/:id`
 *                        (undefined/null when none is known — the server still
 *                        resolves the active stream from its own row)
 * @param lastMessage     the last rendered message; forwarded only when it's the
 *                        in-flight assistant turn, to persist the partial snapshot
 */
export async function stopServerStream(
    conversationId: string,
    activeStreamId: string | null | undefined,
    lastMessage: UIMessage | undefined,
): Promise<void> {
    const body: StopStreamRequest = {
        activeStreamId: activeStreamId ?? undefined,
        assistantMessage:
            lastMessage?.role === "assistant"
                ? (lastMessage as StopStreamRequest["assistantMessage"])
                : undefined,
    };

    await authenticatedFetch(`${API_BASE_URL}/api/v1/ai/chat/${conversationId}/stop`, {
        method: "POST",
        authenticated: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
