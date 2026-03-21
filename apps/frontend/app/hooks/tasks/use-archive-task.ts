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

/** Move a task to trash (ARCHIVED state) with optimistic removal from active caches */
export function useArchiveTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.tasks[":id"].$patch({
                param: { id },
                json: { state: "ARCHIVED" },
            });
            return unwrapResponse<Task>(res);
        },

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
            toast("Task moved to trash", {
                action: { label: "Undo", onClick: () => restoreMutation(id) },
            });
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to move task to trash");
        },

        onSettled: () => invalidateTaskCaches(queryClient),
    });

    function restoreMutation(id: string) {
        client.api.tasks[":id"].$patch({
            param: { id },
            json: { state: "ACTIVE" },
        }).then(() => invalidateTaskCaches(queryClient));
    }
}
