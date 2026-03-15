import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project } from "../../types/project";
import { toast } from "sonner";
import { removeProjectFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

export function useDeleteProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.projects[":id"].$delete({ param: { id } });
            return unwrapResponse<Project>(res);
        },

        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });
            const snapshot = queryClient.getQueriesData<Project[]>({ queryKey: queryKeys.projects.all });

            queryClient.setQueriesData<Project[]>(
                { queryKey: queryKeys.projects.all },
                (old) => transformListCache(old, (items) => items.filter((p) => p.id !== id)),
            );

            return { snapshot };
        },

        onSuccess: (_project, id) => {
            removeProjectFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to delete project");
        },

        onSettled: () => invalidateEverywhere(queryClient, queryKeys.projects.all),
    });
}
