import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

const WORKSPACE_QUERY_PREFIXES: readonly QueryKey[] = [
    queryKeys.tasks.all,
    queryKeys.habits.all,
    queryKeys.projects.all,
    queryKeys.tags.all,
    queryKeys.inbox.all,
    ["inbox_sections"],
    ["sections"],
] as const;

export function invalidateEverywhere(queryClient: QueryClient, queryKey: QueryKey) {
    return queryClient.invalidateQueries({ queryKey, refetchType: "all" });
}

export async function hardRefreshWorkspaceCaches(queryClient: QueryClient) {
    // Drop inactive route caches first so hidden pages cannot surface stale lists on next navigation.
    await Promise.all(
        WORKSPACE_QUERY_PREFIXES.map((queryKey) =>
            queryClient.removeQueries({ queryKey, type: "inactive" }),
        ),
    );

    await Promise.all(
        WORKSPACE_QUERY_PREFIXES.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey, refetchType: "active" }),
        ),
    );
}
