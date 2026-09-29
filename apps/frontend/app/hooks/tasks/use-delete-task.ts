import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { taskCache } from "./optimistic-helpers";
import type { Task } from "@cadence/contracts/task";
import { removeTaskFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";

/** Delete a task with optimistic removal from all caches */
export function useDeleteTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, Task>(
            (id) => ({ type: "delete_task", id }),
            async (id) => {
                const res = await client.api.tasks[":id"].$delete({ param: { id } });
                return unwrapResponse(res);
            },
        ),

        onMutate: async (id) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.filter((t) => t.id !== id)),
            );

            return { snapshot };
        },

        onSuccess: (_task, id) => {
            removeTaskFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't delete task");
            taskCache.invalidate(queryClient);
        },
    });
}

/** Empty Trash: every trashed task goes for good (the server deletes them all, loaded or not). */
export function useEmptyTrash() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => unwrapResponse(await client.api.tasks.trash.$delete()),

        onMutate: async () => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.filter((t) => t.state !== "ARCHIVED")),
            );

            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't empty Trash");
        },

        onSettled: (data, error) => !wasQueued(data, error) && taskCache.invalidate(queryClient),
    });
}
