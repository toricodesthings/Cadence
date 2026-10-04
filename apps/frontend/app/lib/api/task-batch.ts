import type { QueryClient } from "@tanstack/react-query";
import type { TaskBatch } from "@cadence/contracts/task";
import type { ApiClient } from "./client";
import { unwrapResponse } from "./helpers";
import { STALE_TIMES } from "./query-keys";
import { getWalSnapshot } from "./offline-wal";
import { tasksQueryOptions } from "../../hooks/tasks/use-tasks";
import { buildTasksQuery, type UseTasksFilterInput } from "../utils/task/task-scheduling";

/** One background transport, with each result owned/cancelled by its normal query. */
export async function prefetchTaskBatch(
    client: ApiClient,
    queryClient: QueryClient,
    filters: (UseTasksFilterInput & { state: "ACTIVE" | "WAITING" })[],
    signal: AbortSignal,
) {
    // A server read must not overwrite edits that haven't synced yet.
    if (getWalSnapshot().some((entry) => entry.status !== "failed")) return;
    const pending = filters.map((filter) => ({ filter, options: tasksQueryOptions(client, filter) }))
        .filter(({ options }) => {
            const state = queryClient.getQueryState(options.queryKey);
            return state?.fetchStatus !== "fetching" && state?.fetchStatus !== "paused" &&
                (!state?.data || state.isInvalidated || Date.now() - state.dataUpdatedAt >= STALE_TIMES.OFFLINE_WINDOW);
        });
    if (!pending.length || signal.aborted) return;

    let response: Promise<TaskBatch> | undefined;
    await Promise.all(pending.map(({ options }, index) => {
        let batchUsed = false;
        return queryClient.prefetchQuery({
            ...options,
            staleTime: STALE_TIMES.OFFLINE_WINDOW,
            retry: false, // Background warming can try again on the next visibility/online event.
            queryFn: async (context) => {
                // Query retains this function after warming. Later invalidation/refetch
                // must read the server again, rather than replaying the settled batch.
                if (batchUsed && typeof options.queryFn === "function") return options.queryFn(context);
                batchUsed = true;
                response ??= fetchBatch().then(unwrapResponse);
                const batch = await response;
                return batch.lists[index].map((taskIndex) => batch.tasks[taskIndex]);
            },
        });
    }));

    function fetchBatch() {
        return client.api.tasks.batch.$get({
            query: { queries: JSON.stringify(pending.map(({ filter }) => buildTasksQuery(filter))) },
        }, { init: { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) } });
    }
}
