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

    const query = useQuery({
        queryKey: queryKeys.tasks.list(filterOptions as Record<string, unknown>),
        enabled: enabled && authReady && isAuthenticated,
        staleTime: STALE_TIMES.TASKS,
        queryFn: async () => {
            const res = await client.api.tasks.$get({
                // Query params are wire strings the route coerces/enum-validates; the
                // builder's string map satisfies that contract at runtime.
                query: buildTasksQuery(filterOptions) as NonNullable<
                    Parameters<typeof client.api.tasks.$get>[0]
                >["query"],
            });
            return unwrapResponse<Task[]>(res);
        },
    });

    useEffect(() => {
        if (!import.meta.env.DEV) {
            return;
        }

        console.info("[cadence:tasks-query] state changed", {
            filters: filterOptions,
            enabled: enabled && authReady && isAuthenticated,
            status: query.status,
            fetchStatus: query.fetchStatus,
            count: query.data?.length ?? null,
            error: query.error instanceof Error ? query.error.message : null,
        });
    }, [authReady, enabled, filterOptions, isAuthenticated, query.data?.length, query.error, query.fetchStatus, query.status]);

    return query;
}
