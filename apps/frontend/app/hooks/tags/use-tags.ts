import { queryOptions } from "@tanstack/react-query";
import { useAuthedQuery } from "../auth/use-authed-query";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

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
    return useAuthedQuery((client) => tagsQueryOptions(client));
}
