/**
 * Saved-conversation data layer (ai_frontend.md §5.1).
 *
 * Thin react-query wrappers over the typed Hono client — same shape as every
 * other domain hook (see hooks/tasks/use-update-task.ts). The chat turns
 * themselves stream through the Phase-1 transport; these hooks own the
 * sidebar list + load-by-id history.
 */
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

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
            const data = await unwrapResponse(res);
            return data.conversations;
        },
    });
}

/**
 * Load a single thread's messages (load-by-id, §4.1). Disabled until an id is
 * present. Returns the conversation metadata + the reconstructed UIMessage[]
 * ready to hand to `setMessages`.
 */
export function useConversationMessages(id: string | null, refetchInterval: number | false = false) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: id ? queryKeys.ai.conversation(id) : ["ai", "conversation", "none"],
        enabled: authReady && isAuthenticated && !!id,
        staleTime: 5_000,
        refetchInterval,
        // Reopening the panel always asks the server: a turn may have run (or still be
        // running) while it was closed, and the cached copy can't know.
        refetchOnMount: "always",
        // Never restore a thread from the IndexedDB snapshot: the panel seeds useChat
        // once per thread, so a stale snapshot would hide newer server turns after reload.
        meta: { persist: false },
        queryFn: async () => {
            const res = await client.api.ai.conversations[":id"].$get({
                param: { id: id! },
                query: {},
            });
            return unwrapResponse(res);
        },
    });
}
