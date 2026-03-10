import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { Task, TaskState } from "../../types/task";
import { useAuthState } from "../use-auth-state";
import { buildTasksQuery } from "../../lib/utils/task-scheduling";

interface UseTasksOptions {
    state?: TaskState;
    projectId?: string;
    scheduledDate?: string;
    scheduledRange?: { start: string; end: string };
    limit?: number;
    offset?: number;
    hasNoProject?: boolean;
    hasNoDate?: boolean;
    effectiveOnOrBeforeDate?: string;
    /** When false, the query will not execute (useful for view-gated fetching) */
    enabled?: boolean;
}

/** Fetch tasks with server-side filtering — drives Today, Upcoming, and Calendar views */
export function useTasks(options: UseTasksOptions = {}) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { enabled = true, ...filterOptions } = options;

    return useQuery({
        queryKey: queryKeys.tasks.list(filterOptions as Record<string, unknown>),
        enabled: enabled && authReady && isAuthenticated,
        staleTime: STALE_TIMES.TASKS,
        queryFn: async () => {
            const res = await client.api.tasks.$get({
                query: buildTasksQuery(filterOptions),
            });
            return unwrapResponse<Task[]>(res);
        },
    });
}
