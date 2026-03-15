import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag } from "../../types/tag";
import { useAuthState } from "../auth/use-auth-state";

/** Fetch all user tags */
export function useTags() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.tags.all,
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.tags.$get();
            return unwrapResponse<Tag[]>(res);
        },
    });
}
