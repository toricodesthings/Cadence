import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { InboxItem, UpdateInboxItem } from "@cadence/contracts/inbox";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { isPersistedId } from "../../lib/api/optimistic-id";
import { toast } from "sonner";

export function useUpdateInboxItem() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { id: string } & UpdateInboxItem,
            unknown
        >(
            ({ id, ...data }) => ({ type: "update_inbox", id, payload: data as Record<string, unknown> }),
            async ({ id, ...data }) => {
                if (!isPersistedId(id)) {
                    // The capture isn't saved yet — patching by a temp id would 400.
                    throw new Error("Still saving this capture — try again in a moment.");
                }
                const res = await client.api.inbox[":id"].$patch({
                    param: { id },
                    json: data,
                });
                if (!res.ok) throw new Error("Failed to update inbox item");
                return res.json();
            },
        ),
        // Apply the patch to the cached capture immediately. Discard
        // (captureStatus → "discarded") drops it from the holding feed; a
        // section move updates it in place. Both feel instant instead of
        // waiting on the round-trip.
        onMutate: async ({ id, ...data }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.inbox.all });
            const snapshot = queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });
            queryClient.setQueriesData<InboxItem[]>(
                { queryKey: queryKeys.inbox.all },
                (old) =>
                    transformListCache(old, (items) =>
                        items.map((item) => (item.id === id ? { ...item, ...data } as InboxItem : item)),
                    ),
            );
            return { snapshot };
        },
        onError: (err, _variables, context) => {
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(err.message || "Failed to update capture");
        },
        onSettled: () => {
            invalidateEverywhere(queryClient, queryKeys.inbox.all);
        },
    });
}
