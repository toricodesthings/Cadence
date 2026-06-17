/**
 * Saved-conversation data layer (ai_frontend.md §5.1).
 *
 * Thin react-query wrappers over the typed Hono client — same shape as every
 * other domain hook (see hooks/tasks/use-update-task.ts). The chat turns
 * themselves stream through the Phase-1 transport; these hooks own the
 * sidebar list + load-by-id history.
 */
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

/** A row in the conversation sidebar (matches the backend list projection). */
export interface ConversationSummary {
    id: string;
    title: string | null;
    lastMessageAt: string | null;
    archived: boolean;
}

/** Single-conversation metadata returned alongside its messages. */
export interface ConversationDetail {
    id: string;
    title: string | null;
    model?: string | null;
    lastMessageAt: string | null;
    archived: boolean;
    // Non-null while a turn is producing — lets the client hydrate `resume` and
    // hand the live id to the Stop control (doc Update 4 §7.10 / §8).
    activeStreamId?: string | null;
    // The most recently finished stream + its terminal status. A slightly-late
    // re-attach grace-replays `lastStreamId`'s still-alive chunk-log server-side;
    // the status backs the failed-turn Retry affordance (doc Update 4 §7.10).
    lastStreamId?: string | null;
    lastStreamStatus?: string | null;
}

/**
 * A persisted message row reconstructed by the backend. The server reconstructs
 * full `parts` (including resolved tool cards) so a reloaded thread re-renders
 * proposals in their settled state. `metadata.status` may carry "failed" for
 * failed-turn recovery (§8.3).
 */
export interface StoredUIMessage extends UIMessage {
    metadata?: Record<string, unknown>;
}

/** List the signed-in user's conversations, newest-first. */
export function useConversations() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.ai.conversations,
        enabled: authReady && isAuthenticated,
        staleTime: 30_000,
        queryFn: async () => {
            const res = await client.api.ai.conversations.$get({ query: {} });
            const data = await unwrapResponse<{ conversations: ConversationSummary[] }>(res);
            return data.conversations;
        },
    });
}

/**
 * Load a single thread's messages (load-by-id, §4.1). Disabled until an id is
 * present. Returns the conversation metadata + the reconstructed UIMessage[]
 * ready to hand to `setMessages`.
 */
export function useConversationMessages(id: string | null) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: id ? queryKeys.ai.conversation(id) : ["ai", "conversation", "none"],
        enabled: authReady && isAuthenticated && !!id,
        // History is immutable-ish per load; refetch only when the thread changes.
        staleTime: 5_000,
        queryFn: async () => {
            const res = await client.api.ai.conversations[":id"].$get({
                param: { id: id! },
                query: {},
            });
            return unwrapResponse<{
                conversation: ConversationDetail;
                messages: StoredUIMessage[];
            }>(res);
        },
    });
}
