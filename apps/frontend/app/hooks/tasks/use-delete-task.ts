import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    snapshotTaskCache,
    rollbackTaskCache,
    invalidateTaskCaches,
    cancelTaskQueries,
} from "./optimistic-helpers";
import type { Task } from "../../types/task";
import { toast } from "sonner";
import { removeTaskFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/** Delete a task with optimistic removal from all caches */
export function useDeleteTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, Task>(
            (id) => ({ type: "delete_task", id }),
            async (id) => {
                const res = await client.api.tasks[":id"].$delete({ param: { id } });
                return unwrapResponse<Task>(res);
            },
        ),

        onMutate: async (id) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);

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
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to delete task");
        },

        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
