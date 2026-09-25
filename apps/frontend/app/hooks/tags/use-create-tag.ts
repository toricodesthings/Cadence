import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag, CreateTagInput } from "@cadence/contracts/tag";
import { toast } from "sonner";
import { reconcileTagInCaches } from "../../lib/api/cache-sync";
import { createTempId } from "../../lib/api/optimistic-id";
import { tagCache } from "./optimistic-helpers";

/** Create a tag with optimistic insertion */
export function useCreateTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateTagInput) => {
            const res = await client.api.tags.$post({ json: input });
            return unwrapResponse(res);
        },

        onMutate: async (input) => {
            await tagCache.cancel(queryClient);
            const snapshot = tagCache.snapshot(queryClient);

            const optimisticTag: Tag = {
                id: createTempId(),
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
            reconcileTagInCaches(queryClient, tag, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context) tagCache.rollback(queryClient, context.snapshot);
            toast.error(err.message || "Failed to create tag");
        },

        onSettled: () => tagCache.invalidate(queryClient),
    });
}
