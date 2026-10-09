import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { removeTagFromCaches } from "../../lib/api/cache-sync";
import { tagCache } from "./optimistic-helpers";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, undoWindow } from "../../lib/utils/undo-toast";

/** Delete a tag, removing it from the list straight away */
export function useDeleteTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        // The tag disappears at once; the server hears about it only once Undo's window closes.
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            await undoWindow(`Deleted tag ${name}`, { description: "It came off every task. The tasks stay." });
            const res = await client.api.tags[":id"].$delete({ param: { id } });
            return unwrapResponse(res);
        },

        onMutate: async ({ id }) => {
            await tagCache.cancel(queryClient);
            const snapshot = tagCache.snapshot(queryClient);
            removeTagFromCaches(queryClient, id);
            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context) tagCache.rollback(queryClient, context.snapshot);
            if (!isUndone(err)) toastError(err, "Couldn't delete tag");
        },

        onSettled: () => tagCache.invalidate(queryClient),
    });
}
