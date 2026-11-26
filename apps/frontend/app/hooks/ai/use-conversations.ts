import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

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

export function useConversationMessages(id: string | null, refetchInterval: number | false = false) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: id ? queryKeys.ai.conversation(id) : ["ai", "conversation", "none"],
        enabled: authReady && isAuthenticated && !!id,
        staleTime: 5_000,
        refetchInterval,
        refetchOnMount: "always",
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
