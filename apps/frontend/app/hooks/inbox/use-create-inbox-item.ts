import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "../../types/inbox";
import { toast } from "sonner";
import { reconcileInboxItemInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

export function useCreateInboxItem() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, InboxItem>(
            (rawText) => ({
                type: "create_inbox",
                payload: { rawText, clientMutationId: crypto.randomUUID() },
            }),
            async (rawText) => {
                const res = await client.api.inbox.$post({ json: { rawText } });
                return unwrapResponse<InboxItem>(res);
            },
        ),

        onMutate: async (rawText) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.inbox.all });
            const snapshot = queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });

            const optimisticItem: InboxItem = {
                id: `temp-${Date.now()}`,
                userId: "",
                rawText,
                sectionId: null,
                orderIndex: 0,
                processed: false,
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueriesData<InboxItem[]>(
                { queryKey: queryKeys.inbox.all },
                (old) => transformListCache(old, (items) => [optimisticItem, ...items], { initialize: true }),
            );

            return { snapshot, optimisticId: optimisticItem.id };
        },

        onSuccess: (item, _rawText, context) => {
            if (!item) return; // Queued offline
            reconcileInboxItemInCaches(queryClient, item, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to add inbox item");
        },

        onSettled: () => invalidateEverywhere(queryClient, queryKeys.inbox.all),
    });
}
