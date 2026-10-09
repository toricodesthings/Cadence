import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Project } from "@cadence/contracts/project";
import { removeProjectFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { projectCache } from "./optimistic-helpers";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, undoWindow } from "../../lib/utils/undo-toast";

export function useDeleteProject() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        // The list disappears at once; the server hears about it only once Undo's window closes.
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            await undoWindow(`Deleted ${name}`, { description: "Its tasks stay, with no list." });
            const res = await client.api.projects[":id"].$delete({ param: { id } });
            return unwrapResponse(res);
        },

        onMutate: async ({ id }) => {
            await projectCache.cancel(queryClient);
            const snapshot = projectCache.snapshot(queryClient);

            queryClient.setQueriesData<Project[]>(
                { queryKey: queryKeys.projects.all },
                (old) => transformListCache(old, (items) => items.filter((p) => p.id !== id)),
            );

            return { snapshot };
        },

        onSuccess: (_project, { id }) => {
            removeProjectFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => {
            if (context) projectCache.rollback(queryClient, context.snapshot);
            if (!isUndone(err)) toastError(err, "Couldn't delete list");
        },

        onSettled: () => projectCache.invalidate(queryClient),
    });
}
