import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project, CreateProjectInput } from "@cadence/contracts/project";
import { toast } from "sonner";
import { reconcileProjectInCaches } from "../../lib/api/cache-sync";
import { createTempId } from "../../lib/api/optimistic-id";
import { transformListCache } from "../../lib/api/cache-guards";
import { projectCache } from "./optimistic-helpers";

export function useCreateProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateProjectInput) => {
            const res = await client.api.projects.$post({ json: input });
            return unwrapResponse<Project>(res);
        },

        onMutate: async (input) => {
            await projectCache.cancel(queryClient);
            const snapshot = projectCache.snapshot(queryClient);

            const optimisticProject: Project = {
                id: createTempId(),
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
            if (context) projectCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to create list");
        },

        onSettled: () => projectCache.invalidate(queryClient),
    });
}
