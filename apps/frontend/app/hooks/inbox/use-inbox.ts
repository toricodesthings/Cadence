import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useAuthState } from "../auth/use-auth-state";

export function useInbox() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    const query = useQuery({
        queryKey: queryKeys.inbox.all,
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.inbox.$get();
            return unwrapResponse<InboxItem[]>(res);
        },
    });

    useEffect(() => {
        if (!import.meta.env.DEV) {
            return;
        }

        console.info("[cadence:inbox-query] state changed", {
            enabled: authReady && isAuthenticated,
            status: query.status,
            fetchStatus: query.fetchStatus,
            count: query.data?.length ?? null,
            error: query.error instanceof Error ? query.error.message : null,
        });
    }, [authReady, isAuthenticated, query.data?.length, query.error, query.fetchStatus, query.status]);

    return query;
}
