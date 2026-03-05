import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { Task, TaskState } from "../../types/task";

interface UseTasksOptions {
    state?: TaskState;
    projectId?: string;
    scheduledDate?: string;
    scheduledRange?: { start: string; end: string };
    limit?: number;
    offset?: number;
    /** When false, the query will not execute (useful for view-gated fetching) */
    enabled?: boolean;
}

/** Fetch tasks with server-side filtering — drives Today, Upcoming, and Calendar views */
export function useTasks(options: UseTasksOptions = {}) {
    const client = useApiClient();
    const { enabled = true, ...filterOptions } = options;

    return useQuery({
        queryKey: queryKeys.tasks.list(filterOptions as Record<string, unknown>),
        enabled,
        staleTime: STALE_TIMES.TASKS,
        queryFn: async () => {
            const res = await client.api.tasks.$get({
                query: {
                    ...(filterOptions.state && { state: filterOptions.state }),
                    ...(filterOptions.projectId && { projectId: filterOptions.projectId }),
                    ...(filterOptions.scheduledDate && {
                        scheduledDate: filterOptions.scheduledDate,
                    }),
                    ...(filterOptions.scheduledRange?.start && {
                        scheduledRangeStart: filterOptions.scheduledRange.start,
                    }),
                    ...(filterOptions.scheduledRange?.end && {
                        scheduledRangeEnd: filterOptions.scheduledRange.end,
                    }),
                    ...(filterOptions.limit && { limit: String(filterOptions.limit) }),
                    ...(filterOptions.offset && { offset: String(filterOptions.offset) }),
                },
            });
            return unwrapResponse<Task[]>(res);
        },
    });
}
