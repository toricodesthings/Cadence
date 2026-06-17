import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { invalidateTaskCaches, snapshotTaskCache, rollbackTaskCache, cancelTaskQueries } from "./optimistic-helpers";
import type { Task, TaskState } from "@cadence/contracts/task";
import { toast } from "sonner";
import { reconcileTaskInCaches, removeTaskFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/** Batch-transition multiple tasks to a new state (COMPLETE, WAITING, ARCHIVED, ACTIVE) */
export function useBatchStateTransition() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { taskIds: string[]; state: TaskState },
            Task[]
        >(
            ({ taskIds, state }) => ({ type: "batch_state", payload: { taskIds, state } }),
            async ({ taskIds, state }) => {
                const res = await client.api.tasks.batch.state.$patch({
                    json: { taskIds, state },
                });
                return unwrapResponse<Task[]>(res);
            },
        ),
        onMutate: async ({ taskIds, state }) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);
            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) =>
                    items.map((task) => (taskIds.includes(task.id) ? { ...task, state } : task)),
                ),
            );
            return { snapshot };
        },
        onSuccess: (tasks) => {
            if (!tasks) return; // Queued offline
            tasks.forEach((task) => reconcileTaskInCaches(queryClient, task));
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to update tasks");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}

export function useBatchRescheduleTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { taskIds: string[]; scheduledStart: string; isAllDay: boolean },
            Task[]
        >(
            ({ taskIds, scheduledStart, isAllDay }) => ({ type: "batch_reschedule", payload: { taskIds, scheduledStart, isAllDay } }),
            async ({ taskIds, scheduledStart, isAllDay }) => {
                const res = await client.api.tasks.batch.reschedule.$post({
                    json: { taskIds, scheduledStart, isAllDay },
                });
                return unwrapResponse<Task[]>(res);
            },
        ),
        onMutate: async ({ taskIds, scheduledStart, isAllDay }) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);
            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) =>
                    items.map((task) =>
                        taskIds.includes(task.id) ? { ...task, scheduledStart, isAllDay } : task,
                    ),
                ),
            );
            return { snapshot };
        },
        onSuccess: (tasks) => {
            if (!tasks) return; // Queued offline
            tasks.forEach((task) => reconcileTaskInCaches(queryClient, task));
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to reschedule tasks");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}

export function useBatchDeleteTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { taskIds: string[] },
            unknown[]
        >(
            ({ taskIds }) => ({ type: "batch_delete", payload: { taskIds } }),
            async ({ taskIds }) => {
                const results = await Promise.all(taskIds.map(id =>
                    client.api.tasks[":id"].$delete({ param: { id } })
                ));
                return results;
            },
        ),
        onMutate: async ({ taskIds }) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);
            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) =>
                    items.filter((task) => !taskIds.includes(task.id)),
                ),
            );
            return { snapshot };
        },
        onSuccess: (_results, { taskIds }) => {
            taskIds.forEach((taskId) => removeTaskFromCaches(queryClient, taskId));
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to delete tasks");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
