import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { taskCache } from "./optimistic-helpers";
import type { Task } from "@cadence/contracts/task";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { useRestoreTask } from "./use-restore-task";
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

        onMutate: (id) => taskCache.edit(queryClient, (items) => items.filter((t) => t.id !== id && t.seriesId !== id)),

        onSuccess: (task, id) => {
            if (task) reconcileTaskInCaches(queryClient, task);
            toastUndo("Task moved to Trash", () => restoreTask.mutate(id));
        },

        onError: (err, _input, context) => taskCache.fail(queryClient, err, context, "Couldn't move task to trash"),
    });
}
