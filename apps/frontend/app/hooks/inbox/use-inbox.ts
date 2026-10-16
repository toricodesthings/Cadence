import { queryOptions } from "@tanstack/react-query";
import { useAuthedQuery } from "../auth/use-authed-query";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

/** Shared with the offline prefetch so their keys match. */
export function inboxQueryOptions(client: ApiClient, status: "clarifying" | "kept" = "clarifying") {
    return queryOptions({
        queryKey: status === "kept" ? queryKeys.inbox.notes : queryKeys.inbox.all,
        staleTime: STALE_TIMES.INBOX,
        queryFn: async () => {
            const res = await client.api.inbox.$get({ query: { status } });
            return unwrapResponse(res);
        },
    });
}

export function useInbox(status: "clarifying" | "kept" = "clarifying") {
    return useAuthedQuery((client) => inboxQueryOptions(client, status));
}
