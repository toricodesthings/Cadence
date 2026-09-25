import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { toast } from "sonner";
import { unwrapResponse } from "../../lib/api/helpers";
import type { Tag } from "@cadence/contracts/tag";
import { removeTagFromCaches } from "../../lib/api/cache-sync";
import { tagCache } from "./optimistic-helpers";

/** Delete a tag, removing it from the list straight away */
export function useDeleteTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.tags[":id"].$delete({ param: { id } });
            return unwrapResponse<Tag>(res);
        },

        onMutate: async (id) => {
            await tagCache.cancel(queryClient);
            const snapshot = tagCache.snapshot(queryClient);
            removeTagFromCaches(queryClient, id);
            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context) tagCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to delete tag");
        },

        onSettled: () => tagCache.invalidate(queryClient),
    });
}
