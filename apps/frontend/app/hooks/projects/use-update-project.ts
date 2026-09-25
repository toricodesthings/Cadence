import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project } from "@cadence/contracts/project";
import { toast } from "sonner";
import { reconcileProjectInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { projectCache } from "./optimistic-helpers";

export function useUpdateProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...updates
        }: { id: string; name?: string; colorAccent?: string; emoji?: string | null }) => {
            const res = await client.api.projects[":id"].$patch({
                param: { id },
                json: updates,
            });
            return unwrapResponse<Project>(res);
        },

        onMutate: async ({ id, ...updates }) => {
            await projectCache.cancel(queryClient);
            const snapshot = projectCache.snapshot(queryClient);

            queryClient.setQueriesData<Project[]>(
                { queryKey: queryKeys.projects.all },
                (old) => transformListCache(old, (items) => items.map((p) => (p.id === id ? { ...p, ...updates } : p))),
            );

            return { snapshot };
        },

        onSuccess: (project) => {
            reconcileProjectInCaches(queryClient, project);
        },

        onError: (err, _input, context) => {
            if (context) projectCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to update list");
        },

        onSettled: () => projectCache.invalidate(queryClient),
    });
}
