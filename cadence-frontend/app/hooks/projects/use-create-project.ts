import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project, CreateProjectInput } from "../../types/project";
import { toast } from "sonner";

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
                (old) => (old ? [...old, optimisticProject] : [optimisticProject]),
            );

            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to create project");
        },

        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
    });
}
