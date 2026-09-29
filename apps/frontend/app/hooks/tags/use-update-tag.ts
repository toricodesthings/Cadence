import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag, UpdateTag } from "@cadence/contracts/tag";
import { tagCache } from "./optimistic-helpers";
import { toastError } from "../../lib/utils/error-toast";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";

/** Rename or recolour a tag, optimistically in place */
export function useUpdateTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<UpdateTag & { id: string }, Tag>(
            ({ id, ...payload }) => ({ type: "update_tag", id, payload }),
            async ({ id, ...json }) => unwrapResponse(await client.api.tags[":id"].$patch({ param: { id }, json })),
        ),

        onMutate: async ({ id, ...patch }) => {
            await tagCache.cancel(queryClient);
            const snapshot = tagCache.snapshot(queryClient);
            queryClient.setQueryData<Tag[]>(queryKeys.tags.all, (old) =>
                old?.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)),
            );
            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context) tagCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't update tag");
        },

        onSettled: (data, error) => !wasQueued(data, error) && tagCache.invalidate(queryClient),
    });
}
