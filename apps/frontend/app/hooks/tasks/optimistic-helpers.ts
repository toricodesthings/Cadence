import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-keys";
import type { Task } from "../../types/task";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

/** Snapshot all task query caches for rollback */
export function snapshotTaskCache(queryClient: QueryClient) {
    return queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all });
}

/** Rollback task caches from a previous snapshot */
export function rollbackTaskCache(
    queryClient: QueryClient,
    snapshot: ReturnType<typeof snapshotTaskCache>,
) {
    for (const [key, data] of snapshot) {
        queryClient.setQueryData(key, data);
    }
}

/** Invalidate all task caches — used by every mutation's onSettled */
export function invalidateTaskCaches(queryClient: QueryClient) {
    return invalidateEverywhere(queryClient, queryKeys.tasks.all);
}

/** Cancel in-flight task fetches before optimistic update */
export function cancelTaskQueries(queryClient: QueryClient) {
    return queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
}
