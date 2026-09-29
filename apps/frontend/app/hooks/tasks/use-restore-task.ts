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
import { toastError } from "../../lib/utils/error-toast";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/** Restore a task from trash (ARCHIVED → ACTIVE) */
export function useRestoreTask(options?: { showSuccessToast?: boolean; openDetailsOnSuccess?: boolean }) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const showSuccessToast = options?.showSuccessToast ?? true;

    return useMutation({
        mutationFn: withOfflineSupport<string, Task>(
            (id) => ({ type: "update_task", id, payload: { state: "ACTIVE" } }),
            async (id) => unwrapResponse(await client.api.tasks[":id"].$patch({ param: { id }, json: { state: "ACTIVE" } })),
        ),

        onMutate: async (id) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
            // Kept so a restore queued offline can put the task back in its lists now.
            const trashed = snapshot.flatMap(([, list]) => (Array.isArray(list) ? (list as Task[]) : [])).find((t) => t.id === id);

            // Remove from archived/trash cache optimistically
            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.filter((t) => t.id !== id)),
            );

            return { snapshot, trashed };
        },

        onSuccess: (task, id, context) => {
            const restored = task ?? (context?.trashed && { ...context.trashed, state: "ACTIVE" as const });
            if (restored) reconcileTaskInCaches(queryClient, restored);
            if (options?.openDetailsOnSuccess) openTaskDetails(id);
            if (showSuccessToast) {
                toast.success("Task restored");
            }
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't restore task");
            taskCache.invalidate(queryClient);
        },
    });
}
