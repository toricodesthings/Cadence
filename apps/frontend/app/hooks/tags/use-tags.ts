import { queryOptions, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

/** Shared with the offline prefetch so their keys match. */
export function tagsQueryOptions(client: ApiClient) {
    return queryOptions({
        queryKey: queryKeys.tags.all,
        staleTime: STALE_TIMES.TAGS,
        queryFn: async () => {
            const res = await client.api.tags.$get();
            return unwrapResponse(res);
        },
    });
}

/** Fetch all user tags */
export function useTags() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        ...tagsQueryOptions(client),
        enabled: authReady && isAuthenticated,
    });
}
