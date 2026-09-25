import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { taskCache } from "./optimistic-helpers";
import type { Task, TaskState } from "@cadence/contracts/task";
import { toast } from "sonner";
import { reconcileTaskInCaches, removeTaskFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { chunk } from "../../lib/utils";

/** The batch routes take at most 50 ids, so larger selections go as several calls. */
async function inBatches<T>(taskIds: string[], send: (ids: string[]) => Promise<T[]>): Promise<T[]> {
    return (await Promise.all(chunk(taskIds, 50).map(send))).flat();
}

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
            ({ taskIds, state }) => inBatches(taskIds, async (ids) =>
                unwrapResponse(await client.api.tasks.batch.state.$patch({ json: { taskIds: ids, state } }))),
        ),
        onMutate: async ({ taskIds, state }) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
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
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to update tasks");
            taskCache.invalidate(queryClient);
        },
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
            ({ taskIds, scheduledStart, isAllDay }) => inBatches(taskIds, async (ids) =>
                unwrapResponse(await client.api.tasks.batch.reschedule.$post({ json: { taskIds: ids, scheduledStart, isAllDay } }))),
        ),
        onMutate: async ({ taskIds, scheduledStart, isAllDay }) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
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
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to reschedule tasks");
            taskCache.invalidate(queryClient);
        },
    });
}

export function useBatchDeleteTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { taskIds: string[] },
            Task[]
        >(
            ({ taskIds }) => ({ type: "batch_delete", payload: { taskIds } }),
            ({ taskIds }) => inBatches(taskIds, async (ids) =>
                unwrapResponse(await client.api.tasks.batch.delete.$post({ json: { taskIds: ids } }))),
        ),
        onMutate: async ({ taskIds }) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
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
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to delete tasks");
            taskCache.invalidate(queryClient);
        },
    });
}
