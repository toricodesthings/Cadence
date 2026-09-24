import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { taskCache } from "./optimistic-helpers";
import type { Task } from "@cadence/contracts/task";
import { toast } from "sonner";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { useRestoreTask } from "./use-restore-task";

/** Move a task to trash (ARCHIVED state) with optimistic removal from active caches */
export function useArchiveTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const restoreTask = useRestoreTask({ showSuccessToast: false, openDetailsOnSuccess: true });

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.tasks[":id"].$patch({
                param: { id },
                json: { state: "ARCHIVED" },
            });
            return unwrapResponse<Task>(res);
        },

        onMutate: async (id) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.filter((t) => t.id !== id && t.seriesId !== id)),
            );

            return { snapshot };
        },

        onSuccess: (task, id) => {
            reconcileTaskInCaches(queryClient, task);
            toast("Task moved to trash", {
                action: { label: "Undo", onClick: () => restoreTask.mutate(id) },
            });
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to move task to trash");
            taskCache.invalidate(queryClient);
        },
    });
}
