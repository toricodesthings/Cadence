import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { Task, TaskState } from "@cadence/contracts/task";
import { useAuthState } from "../auth/use-auth-state";
import { buildTasksQuery } from "../../lib/utils/task/task-scheduling";

interface UseTasksOptions {
    state?: TaskState;
    projectId?: string;
    scheduledDate?: string;
    scheduledRange?: { start: string; end: string };
    /** Fetch every page for workspace-wide summaries. */
    allPages?: boolean;
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
    const { enabled = true, allPages, ...filterOptions } = options;

    const query = useQuery({
        queryKey: queryKeys.tasks.list({ ...filterOptions, ...(allPages ? { allPages: true } : {}) }),
        enabled: enabled && authReady && isAuthenticated,
        staleTime: STALE_TIMES.TASKS,
        queryFn: async () => {
            const items: Task[] = [];
            const pageSize = 100;
            let offset = 0;
            do {
                const res = await client.api.tasks.$get({
                    query: buildTasksQuery({
                        ...filterOptions,
                        ...(allPages ? { limit: pageSize, offset } : {}),
                    }) as NonNullable<Parameters<typeof client.api.tasks.$get>[0]>["query"],
                });
                const page = await unwrapResponse<Task[]>(res);
                items.push(...page);
                // Schedule queries already return all expanded occurrences without pagination.
                if (!allPages || filterOptions.scheduledDate || filterOptions.scheduledRange || page.length < pageSize) break;
                offset += pageSize;
            } while (true);
            return items;
        },
    });

    useEffect(() => {
        if (query.error) {
            console.error("[cadence:tasks-query] error", query.error);
        }
    }, [query.error]);

    return query;
}
