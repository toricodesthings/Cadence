import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project, CreateProjectInput } from "../../types/project";
import { toast } from "sonner";
import { reconcileProjectInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

export function useCreateProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateProjectInput) => {
            const res = await client.api.projects.$post({ json: input });
            return unwrapResponse<Project>(res);
        },

        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });
            const snapshot = queryClient.getQueriesData<Project[]>({ queryKey: queryKeys.projects.all });

            const optimisticProject: Project = {
                id: `temp-${Date.now()}`,
                userId: "",
                name: input.name,
                colorAccent: input.colorAccent || "luminous-amber",
                emoji: input.emoji || null,
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueriesData<Project[]>(
                { queryKey: queryKeys.projects.all },
                (old) => transformListCache(old, (items) => [...items, optimisticProject], { initialize: true }),
            );

            return { snapshot, optimisticId: optimisticProject.id };
        },

        onSuccess: (project, _input, context) => {
            reconcileProjectInCaches(queryClient, project, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to create project");
        },

        onSettled: () => invalidateEverywhere(queryClient, queryKeys.projects.all),
    });
}
