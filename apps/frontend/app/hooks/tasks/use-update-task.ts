import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    snapshotTaskCache,
    rollbackTaskCache,
    invalidateTaskCaches,
    cancelTaskQueries,
} from "./optimistic-helpers";
import type { Task, UpdateTaskInput } from "../../types/task";
import { toast } from "sonner";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { isRecurringTask } from "../../lib/utils/task-scheduling";

/** Update any task field with optimistic patching across all caches */
export function useUpdateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...updates
        }: { id: string } & UpdateTaskInput) => {
            const res = await client.api.tasks[":id"].$patch({
                param: { id },
                json: updates,
            });
            return unwrapResponse<Task>(res);
        },

        onMutate: async ({ id, ...updates }) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.map((t) => (t.id === id ? { ...t, ...updates } : t))),
            );

            return { snapshot };
        },

        onSuccess: (task) => {
            if (isRecurringTask(task)) {
                invalidateTaskCaches(queryClient);
                return;
            }
            reconcileTaskInCaches(queryClient, task);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to update task");
            invalidateTaskCaches(queryClient);
        },
    });
}
