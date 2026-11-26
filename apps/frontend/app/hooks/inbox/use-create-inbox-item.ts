import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refetchAfterWrites } from "../../lib/api/write-gate";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { InboxItem } from "@cadence/contracts/inbox";
import { reconcileInboxItemInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";
import { inboxCache } from "./optimistic-helpers";
import { useSettings } from "../core/use-settings";

export interface NewCapture {
    id: string;
    rawText: string;
    placing?: boolean;
}

export function useCreateInboxItem() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const smartPlacementOn = useSettings().data?.tasks.intelligence?.smartPlacement !== false;

    return useMutation({
        mutationFn: withOfflineSupport<NewCapture, InboxItem>(
            ({ id, rawText }) => ({ type: "create_inbox", payload: { id, rawText } }),
            async ({ id, rawText }) => {
                const res = await client.api.inbox.$post(
                    { json: { id, rawText } },
                    { headers: { "Idempotency-Key": id } },
                );
                return unwrapResponse(res);
            },
        ),

        onMutate: async ({ id, rawText, placing }) => {
            if (placing) return undefined;
            await inboxCache.cancel(queryClient);
            const snapshot = inboxCache.snapshot(queryClient);

            const optimisticItem: InboxItem = {
                id,
                userId: "",
                rawText,
                sectionId: null,
                orderIndex: 0,
                processed: false,
                captureKind: "unknown",
                captureStatus: "clarifying",
                placedTaskId: null,
                aiSuggestion: null,
                analysisStatus: null,
                analysisVersion: null,
                analysisSummary: null,
                analysis: null,
                sourceSurface: null,
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all }, (old) =>
                transformListCache(old, (items) => [optimisticItem, ...items], { initialize: true }),
            );

            return { snapshot, optimisticId: optimisticItem.id };
        },

        onSuccess: (item, { placing }, context) => {
            if (!item || placing) return;
            reconcileInboxItemInCaches(queryClient, item, context?.optimisticId);
            if (smartPlacementOn)
                setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all }), 4_000);
        },

        onError: (err, _input, context) => {
            if (context) inboxCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't add inbox item");
        },

        onSettled: (data, error, { placing }) =>
            !placing && !wasQueued(data, error) && refetchAfterWrites(queryClient, queryKeys.inbox.all),
    });
}
