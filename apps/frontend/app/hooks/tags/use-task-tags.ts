import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import { transformListCache } from "../../lib/api/cache-guards";
import { taskCache } from "../tasks/optimistic-helpers";
import type { Task } from "@cadence/contracts/task";

type TaskTagVars = { taskId: string; tagId: string };

/** Shared optimistic add/remove: the task's `tagIds` flip at once so pickers tick without waiting. */
function useTaskTagMutation(adding: boolean, request: (vars: TaskTagVars) => Promise<unknown>) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: request,
        onMutate: async ({ taskId, tagId }) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
            queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.all }, (old) =>
                transformListCache(old, (items) => items.map((t) => {
                    if (t.id !== taskId) return t;
                    const rest = (t.tagIds ?? []).filter((id) => id !== tagId);
                    return { ...t, tagIds: adding ? [...rest, tagId] : rest };
                })),
            );
            return { snapshot };
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || (adding ? "Failed to add tag" : "Failed to remove tag"));
        },
        onSettled: (_data, _err, { taskId }) => {
            invalidateEverywhere(queryClient, queryKeys.tasks.all);
            invalidateEverywhere(queryClient, ["tasks", taskId, "tags"]);
        },
    });
}

/** Add a tag to a task */
export function useAddTaskTag() {
    const client = useApiClient();
    return useTaskTagMutation(true, async ({ taskId, tagId }) => {
        const res = await client.api.tasks[":id"].tags.$post({ param: { id: taskId }, json: { tagId } });
        return unwrapResponse<unknown>(res);
    });
}

/** Remove a tag from a task */
export function useRemoveTaskTag() {
    const client = useApiClient();
    return useTaskTagMutation(false, async ({ taskId, tagId }) => {
        const res = await client.api.tasks[":id"].tags[":tagId"].$delete({ param: { id: taskId, tagId } });
        return unwrapResponse<unknown>(res);
    });
}
