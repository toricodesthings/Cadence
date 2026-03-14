import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import type { InsertInboxItem, UpdateInboxItem } from "@cadence/backend/types/inbox";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

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
        onSuccess: () => {
            invalidateEverywhere(queryClient, ["inbox"]);
        },
    });
}
