import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project, CreateProjectInput } from "@cadence/contracts/project";
import { reconcileProjectInCaches } from "../../lib/api/cache-sync";
import { clientIdFor } from "../../lib/api/optimistic-id";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { transformListCache } from "../../lib/api/cache-guards";
import { projectCache } from "./optimistic-helpers";
import { toastError } from "../../lib/utils/error-toast";

export function useCreateProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<CreateProjectInput, Project>(
            (input) => ({ type: "create_project", payload: { ...input, id: clientIdFor(input) } }),
            async (input) => {
                const id = clientIdFor(input);
                return unwrapResponse(await client.api.projects.$post({ json: { ...input, id } }, { headers: { "Idempotency-Key": id } }));
            },
        ),

        onMutate: async (input) => {
            await projectCache.cancel(queryClient);
            const snapshot = projectCache.snapshot(queryClient);

            const optimisticProject: Project = {
                id: clientIdFor(input),
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
            if (project) reconcileProjectInCaches(queryClient, project, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context) projectCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't create list");
        },

        onSettled: (data, error) => !wasQueued(data, error) && projectCache.invalidate(queryClient),
    });
}
