import { queryOptions } from "@tanstack/react-query";
import type { Tag } from "@cadence/contracts/tag";
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

/** The person's own order. Sorted here because an optimistic edit changes `sortOrder` but not the array. */
const byOrder = (tags: Tag[]) => [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

/** Fetch all user tags, in the person's own order */
export function useTags() {
    return useAuthedQuery((client) => ({ ...tagsQueryOptions(client), select: byOrder }));
}
