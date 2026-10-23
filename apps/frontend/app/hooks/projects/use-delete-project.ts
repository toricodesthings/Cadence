import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { removeProjectFromCaches } from "../../lib/api/cache-sync";
import { projectCache } from "./optimistic-helpers";
import { undoWindow } from "../../lib/utils/undo-toast";

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

        onMutate: ({ id }) => projectCache.edit(queryClient, (items) => items.filter((p) => p.id !== id)),

        onSuccess: (_project, { id }) => {
            removeProjectFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => projectCache.undo(queryClient, err, context, "Couldn't delete list"),

        onSettled: () => projectCache.invalidate(queryClient),
    });
}
