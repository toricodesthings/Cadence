import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project } from "@cadence/contracts/project";
import { toast } from "sonner";
import { removeProjectFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { projectCache } from "./optimistic-helpers";

export function useDeleteProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.projects[":id"].$delete({ param: { id } });
            return unwrapResponse(res);
        },

        onMutate: async (id) => {
            await projectCache.cancel(queryClient);
            const snapshot = projectCache.snapshot(queryClient);

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
            if (context) projectCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to delete list");
        },

        onSettled: () => projectCache.invalidate(queryClient),
    });
}
