import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { taskCache } from "./optimistic-helpers";
import type { Task } from "@cadence/contracts/task";
import { toast } from "sonner";
import { transformListCache } from "../../lib/api/cache-guards";
import { queryKeys } from "../../lib/api/query-keys";
import { openTaskDetails } from "../../lib/actions/task-details";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";

/** Restore a task from trash (ARCHIVED → ACTIVE) */
export function useRestoreTask(options?: { showSuccessToast?: boolean; openDetailsOnSuccess?: boolean }) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const showSuccessToast = options?.showSuccessToast ?? true;

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.tasks[":id"].$patch({
                param: { id },
                json: { state: "ACTIVE" },
            });
            return unwrapResponse(res);
        },

        onMutate: async (id) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            // Remove from archived/trash cache optimistically
            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.filter((t) => t.id !== id)),
            );

            return { snapshot };
        },

        onSuccess: (task) => {
            if (task) {
                reconcileTaskInCaches(queryClient, task);
                if (options?.openDetailsOnSuccess) openTaskDetails(task.id);
            }
            if (showSuccessToast) {
                toast.success("Task restored");
            }
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to restore task");
            taskCache.invalidate(queryClient);
        },
    });
}
