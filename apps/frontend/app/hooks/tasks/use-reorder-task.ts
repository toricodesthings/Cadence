import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { invalidateTaskCaches, snapshotTaskCache, rollbackTaskCache, cancelTaskQueries } from "./optimistic-helpers";
import type { Task } from "../../types/task";
import { toast } from "sonner";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";

/** Reorder a task via fractional index — component handles optimistic array reorder */
export function useReorderTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            orderIndex,
            orderedTaskIds,
        }: {
            id: string;
            orderIndex: number;
            orderedTaskIds: string[];
        }) => {
            const res = await client.api.tasks[":id"].reorder.$patch({
                param: { id },
                json: { orderIndex },
            });
            return unwrapResponse<Task>(res);
        },
        onMutate: async ({ id, orderIndex, orderedTaskIds }) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);
            const rank = new Map(orderedTaskIds.map((taskId, index) => [taskId, index] as const));

            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) => {
                    const reorderedSubset = items
                        .filter((task) => rank.has(task.id))
                        .map((task) => (task.id === id ? { ...task, orderIndex } : task))
                        .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));

                    let subsetIndex = 0;

                    return items.map((task) => {
                        if (!rank.has(task.id)) {
                            return task.id === id ? { ...task, orderIndex } : task;
                        }

                        const nextTask = reorderedSubset[subsetIndex];
                        subsetIndex += 1;
                        return nextTask ?? task;
                    });
                }),
            );
            return { snapshot };
        },
        onSuccess: (task) => {
            reconcileTaskInCaches(queryClient, task);
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to reorder task");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
