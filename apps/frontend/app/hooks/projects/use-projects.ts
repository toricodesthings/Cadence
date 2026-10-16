import { queryOptions } from "@tanstack/react-query";
import { useAuthedQuery } from "../auth/use-authed-query";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

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
    return useAuthedQuery((client) => projectsQueryOptions(client));
}
