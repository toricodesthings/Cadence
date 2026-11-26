import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

export function useAiUsage(enabled: boolean) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.ai.usage,
        enabled: enabled && authReady && isAuthenticated,
        staleTime: 15_000,
        queryFn: async () => {
            const res = await client.api.ai.usage.$get();
            return unwrapResponse(res);
        },
    });
}
