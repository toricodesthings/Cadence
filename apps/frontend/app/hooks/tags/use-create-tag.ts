import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag, CreateTagInput } from "@cadence/contracts/tag";
import { reconcileTagInCaches } from "../../lib/api/cache-sync";
import { clientIdFor } from "../../lib/api/optimistic-id";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { tagCache } from "./optimistic-helpers";
import { toastError } from "../../lib/utils/error-toast";

/** Create a tag with optimistic insertion */
export function useCreateTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<CreateTagInput, Tag>(
            (input) => ({ type: "create_tag", payload: { ...input, id: clientIdFor(input) } }),
            async (input) => {
                const id = clientIdFor(input);
                return unwrapResponse(await client.api.tags.$post({ json: { ...input, id } }, { headers: { "Idempotency-Key": id } }));
            },
        ),

        onMutate: async (input) => {
            await tagCache.cancel(queryClient);
            const snapshot = tagCache.snapshot(queryClient);

            const optimisticTag: Tag = {
                id: clientIdFor(input),
                userId: "",
                name: input.name,
                color: input.color ?? "default",
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueryData<Tag[]>(queryKeys.tags.all, (old) =>
                old ? [...old, optimisticTag] : [optimisticTag],
            );

            return { snapshot, optimisticId: optimisticTag.id };
        },

        onSuccess: (tag, _input, context) => {
            if (tag) reconcileTagInCaches(queryClient, tag, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context) tagCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't create tag");
        },

        onSettled: (data, error) => !wasQueued(data, error) && tagCache.invalidate(queryClient),
    });
}
