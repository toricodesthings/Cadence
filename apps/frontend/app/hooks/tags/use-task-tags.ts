import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";
import type { Tag } from "../../types/tag";
import { useAuthState } from "../auth/use-auth-state";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

export function useTaskTags(taskId: string) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: ["tasks", taskId, "tags"],
        queryFn: async () => {
            const res = await client.api.tasks[":id"].tags.$get({
                param: { id: taskId },
            });
            return unwrapResponse<Tag[]>(res);
        },
        enabled: !!taskId && authReady && isAuthenticated,
    });
}

/** Add a tag to a task */
export function useAddTaskTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            taskId,
            tagId,
        }: {
            taskId: string;
            tagId: string;
        }) => {
            const res = await client.api.tasks[":id"].tags.$post({
                param: { id: taskId },
                json: { tagId },
            });
            return unwrapResponse<unknown>(res);
        },
        onSettled: (_data, _err, variables) => {
            invalidateEverywhere(queryClient, queryKeys.tasks.all);
            invalidateEverywhere(queryClient, ["tasks", variables.taskId, "tags"]);
        },
        onError: (err) => toast.error(err.message || "Failed to add tag"),
    });
}

/** Remove a tag from a task */
export function useRemoveTaskTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            taskId,
            tagId,
        }: {
            taskId: string;
            tagId: string;
        }) => {
            const res = await client.api.tasks[":id"].tags[":tagId"].$delete({
                param: { id: taskId, tagId },
            });
            return unwrapResponse<unknown>(res);
        },
        onSettled: (_data, _err, variables) => {
            invalidateEverywhere(queryClient, queryKeys.tasks.all);
            invalidateEverywhere(queryClient, ["tasks", variables.taskId, "tags"]);
        },
        onError: (err) => toast.error(err.message || "Failed to remove tag"),
    });
}
