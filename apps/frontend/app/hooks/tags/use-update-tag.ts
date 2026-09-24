import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag, UpdateTag } from "@cadence/contracts/tag";
import { toast } from "sonner";

/** Rename or recolour a tag, optimistically in place */
export function useUpdateTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...json }: UpdateTag & { id: string }) => {
            const res = await client.api.tags[":id"].$patch({ param: { id }, json });
            return unwrapResponse<Tag>(res);
        },

        onMutate: async ({ id, ...patch }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.tags.all });
            const snapshot = queryClient.getQueryData<Tag[]>(queryKeys.tags.all);
            queryClient.setQueryData<Tag[]>(queryKeys.tags.all, (old) =>
                old?.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)),
            );
            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) queryClient.setQueryData(queryKeys.tags.all, context.snapshot);
            toast.error(err.message || "Failed to update tag");
        },

        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tags.all }),
    });
}
