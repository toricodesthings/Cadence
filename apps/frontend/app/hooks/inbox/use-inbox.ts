import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useAuthState } from "../auth/use-auth-state";

export function useInbox() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    const query = useQuery({
        queryKey: queryKeys.inbox.all,
        staleTime: STALE_TIMES.INBOX,
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.inbox.$get();
            return unwrapResponse<InboxItem[]>(res);
        },
    });

    useEffect(() => {
        if (query.error) {
            console.error("[cadence:inbox-query] error", query.error);
        }
    }, [query.error]);

    return query;
}
