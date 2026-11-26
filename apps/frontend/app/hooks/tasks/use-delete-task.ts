import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { taskCache } from "./optimistic-helpers";
import type { Task } from "@cadence/contracts/task";
import { removeTaskFromCaches } from "../../lib/api/cache-sync";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";

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

        onMutate: (id) => taskCache.edit(queryClient, (items) => items.filter((t) => t.id !== id)),

        onSuccess: (_task, id) => {
            removeTaskFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => taskCache.fail(queryClient, err, context, "Couldn't delete task"),
    });
}

export function useEmptyTrash() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => unwrapResponse(await client.api.tasks.trash.$delete()),

        onMutate: () => taskCache.edit(queryClient, (items) => items.filter((t) => t.state !== "ARCHIVED")),

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't empty Trash");
        },

        onSettled: (data, error) => !wasQueued(data, error) && taskCache.invalidate(queryClient),
    });
}
