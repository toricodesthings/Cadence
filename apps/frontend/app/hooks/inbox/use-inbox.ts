import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "../../types/inbox";
import { useAuthState } from "../auth/use-auth-state";

export function useInbox() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.inbox.all,
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.inbox.$get();
            return unwrapResponse<InboxItem[]>(res);
        },
    });
}
