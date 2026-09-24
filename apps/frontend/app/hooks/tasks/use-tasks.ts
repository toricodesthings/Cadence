import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
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
    /** Keep the last result on screen while a new key loads (growing pages). */
    keepPrevious?: boolean;
}

/** Fetch tasks with server-side filtering — drives Today, Upcoming, and Calendar views */
export function useTasks(options: UseTasksOptions = {}) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { enabled = true, keepPrevious, ...filterOptions } = options;

    const query = useQuery({
        queryKey: queryKeys.tasks.list(filterOptions),
        enabled: enabled && authReady && isAuthenticated,
        staleTime: STALE_TIMES.TASKS,
        placeholderData: keepPrevious ? keepPreviousData : undefined,
        // Without a limit the server returns the whole list.
        queryFn: async () => unwrapResponse<Task[]>(await client.api.tasks.$get({
            query: buildTasksQuery(filterOptions) as NonNullable<Parameters<typeof client.api.tasks.$get>[0]>["query"],
        })),
    });

    useEffect(() => {
        if (query.error) {
            console.error("[cadence:tasks-query] error", query.error);
        }
    }, [query.error]);

    return query;
}

const PAGE_SIZE = 100;

/** Done and Trash grow forever: newest first, 100 more per `loadMore`, up to the route's 1000. */
export function usePagedTasks(state: "COMPLETE" | "ARCHIVED") {
    const [limit, setLimit] = useState(PAGE_SIZE);
    // ponytail: each page refetches the earlier ones; move to offset pages if people keep years of Done.
    const query = useTasks({ state, limit, keepPrevious: true });
    const hasMore = (query.data?.length ?? 0) >= limit && limit < 1000;
    return { ...query, loadMore: hasMore ? () => setLimit((current) => current + PAGE_SIZE) : undefined };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One task, read from whichever cached list holds it so optimistic edits show at once;
 * `GET /tasks/:id` only when no list has it (a Done task from a link, say).
 */
export function useTask(taskId: string | null | undefined) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { authReady, isAuthenticated } = useAuthState();

    // ponytail: scans every cached list per cache event; index by id if large workspaces feel it.
    const findCached = useCallback(() => {
        if (!taskId) return undefined;
        for (const [key, list] of queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all })) {
            if (typeof key[1] !== "object" || !Array.isArray(list)) continue;
            const task = list.find((entry) => entry.id === taskId);
            if (task) return task;
        }
        return undefined;
    }, [queryClient, taskId]);
    const cached = useSyncExternalStore(
        useCallback((onChange) => queryClient.getQueryCache().subscribe(onChange), [queryClient]),
        findCached,
        findCached,
    );

    const detail = useQuery({
        queryKey: queryKeys.tasks.detail(taskId ?? ""),
        enabled: !cached && !!taskId && UUID.test(taskId) && authReady && isAuthenticated,
        staleTime: STALE_TIMES.TASKS,
        queryFn: async () => unwrapResponse<Task>(await client.api.tasks[":id"].$get({ param: { id: taskId! } })),
    });

    return cached ?? detail.data;
}
