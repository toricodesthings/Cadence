import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "@cadence/contracts/inbox";
import { removeInboxItemFromCaches } from "../../lib/api/cache-sync";
import { inboxCache } from "./optimistic-helpers";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";

export function useDeleteInboxItem() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, InboxItem>(
            (id) => ({ type: "delete_inbox", id }),
            async (id) => {
                const res = await client.api.inbox[":id"].$delete({ param: { id } });
                return unwrapResponse(res);
            },
        ),

        onMutate: (id) => inboxCache.edit(queryClient, (items) => items.filter((item) => item.id !== id)),

        onSuccess: (_item, id) => {
            removeInboxItemFromCaches(queryClient, id);
        },

        onError: (err, _input, context) => {
            if (context) inboxCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't delete inbox item");
        },

        onSettled: (data, error) => !wasQueued(data, error) && queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all }),
    });
}
