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
import type { ConversationDetail, ConversationListItem } from "@cadence/contracts/ai";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

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
            const data = await unwrapResponse<{ conversations: ConversationListItem[] }>(res);
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
        // Never restore a thread from the IndexedDB snapshot: the panel seeds useChat
        // once per thread, so a stale snapshot would hide newer server turns after reload.
        meta: { persist: false },
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
