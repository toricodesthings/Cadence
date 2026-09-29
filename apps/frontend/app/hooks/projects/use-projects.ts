import { queryOptions, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

/** Shared with the offline prefetch so their keys match. */
export function projectsQueryOptions(client: ApiClient) {
    return queryOptions({
        queryKey: queryKeys.projects.all,
        staleTime: STALE_TIMES.PROJECTS,
        queryFn: async () => {
            const res = await client.api.projects.$get();
            return unwrapResponse(res);
        },
    });
}

export function useProjects() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        ...projectsQueryOptions(client),
        enabled: authReady && isAuthenticated,
    });
}
