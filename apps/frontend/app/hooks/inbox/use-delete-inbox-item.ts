import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "../../types/inbox";
import { toast } from "sonner";
import { removeInboxItemFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

export function useDeleteInboxItem() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.inbox[":id"].$delete({ param: { id } });
            return unwrapResponse<InboxItem>(res);
        },

        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.inbox.all });
            const snapshot = queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });

            queryClient.setQueriesData<InboxItem[]>(
                { queryKey: queryKeys.inbox.all },
                (old) => transformListCache(old, (items) => items.filter((item) => item.id !== id)),
            );

            return { snapshot };
        },

        onSuccess: (_item, id) => {
            removeInboxItemFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to delete inbox item");
        },

        onSettled: () => invalidateEverywhere(queryClient, queryKeys.inbox.all),
    });
}
