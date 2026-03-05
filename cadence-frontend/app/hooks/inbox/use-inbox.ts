import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "../../types/inbox";

export function useInbox() {
    const client = useApiClient();

    return useQuery({
        queryKey: queryKeys.inbox.all,
        queryFn: async () => {
            const res = await client.api.inbox.$get();
            return unwrapResponse<InboxItem[]>(res);
        },
    });
}
