import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag, CreateTagInput } from "../../types/tag";
import { toast } from "sonner";

/** Create a tag with optimistic insertion */
export function useCreateTag() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateTagInput) => {
            const res = await client.api.tags.$post({ json: input });
            return unwrapResponse<Tag>(res);
        },

        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.tags.all });
            const snapshot = queryClient.getQueryData<Tag[]>(queryKeys.tags.all);

            const optimisticTag: Tag = {
                id: `temp-${Date.now()}`,
                userId: "",
                name: input.name,
                color: input.color ?? "default",
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueryData<Tag[]>(queryKeys.tags.all, (old) =>
                old ? [...old, optimisticTag] : [optimisticTag],
            );

            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                queryClient.setQueryData(queryKeys.tags.all, context.snapshot);
            }
            toast.error(err.message || "Failed to create tag");
        },

        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: queryKeys.tags.all }),
    });
}
