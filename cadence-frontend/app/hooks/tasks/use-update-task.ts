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
                (old) => old?.map((t) => (t.id === id ? { ...t, ...updates } : t)),
            );

            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to update task");
        },

        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
