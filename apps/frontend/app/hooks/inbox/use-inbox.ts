import { queryOptions, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

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
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        ...inboxQueryOptions(client, status),
        enabled: authReady && isAuthenticated,
    });
}
