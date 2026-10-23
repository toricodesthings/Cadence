import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { InboxItem, UpdateInboxItem } from "@cadence/contracts/inbox";
import { queryKeys } from "../../lib/api/query-keys";
import { inboxCache } from "./optimistic-helpers";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";

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
        onMutate: ({ id, ...data }) =>
            inboxCache.edit(queryClient, (items) => items.map((item) => (item.id === id ? { ...item, ...data } as InboxItem : item))),
        onError: (err, _variables, context) => {
            if (context) inboxCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't update capture");
        },
        onSettled: (data, error) => {
            if (!wasQueued(data, error)) queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
        },
    });
}
