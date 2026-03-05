import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag } from "../../types/tag";

/** Fetch all user tags */
export function useTags() {
    const client = useApiClient();

    return useQuery({
        queryKey: queryKeys.tags.all,
        queryFn: async () => {
            const res = await client.api.tags.$get();
            return unwrapResponse<Tag[]>(res);
        },
    });
}
