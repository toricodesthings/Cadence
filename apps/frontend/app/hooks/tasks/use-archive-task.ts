import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { taskCache } from "./optimistic-helpers";
import type { Task } from "@cadence/contracts/task";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { useRestoreTask } from "./use-restore-task";
import { toastError } from "../../lib/utils/error-toast";
import { toastUndo } from "../../lib/utils/undo-toast";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/** Move a task to trash (ARCHIVED state) with optimistic removal from active caches */
export function useArchiveTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const restoreTask = useRestoreTask({ showSuccessToast: false, openDetailsOnSuccess: true });

    return useMutation({
        mutationFn: withOfflineSupport<string, Task>(
            (id) => ({ type: "update_task", id, payload: { state: "ARCHIVED" } }),
            async (id) => unwrapResponse(await client.api.tasks[":id"].$patch({ param: { id }, json: { state: "ARCHIVED" } })),
        ),

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
            if (task) reconcileTaskInCaches(queryClient, task);
            toastUndo("Task moved to Trash", () => restoreTask.mutate(id));
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't move task to trash");
            taskCache.invalidate(queryClient);
        },
    });
}
