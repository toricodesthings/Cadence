import { queryOptions } from "@tanstack/react-query";
import type { Tag } from "@cadence/contracts/tag";
import { useAuthedQuery } from "../auth/use-authed-query";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

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

const byOrder = (tags: Tag[]) => [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export function useTags() {
    return useAuthedQuery((client) => ({ ...tagsQueryOptions(client), select: byOrder }));
}
