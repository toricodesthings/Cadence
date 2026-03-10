import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import type { InsertInboxItem, UpdateInboxItem } from "@cadence/backend/types/inbox";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

export function useUpdateInboxItem() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...data }: { id: string } & UpdateInboxItem) => {
            const res = await api.inbox[":id"].$patch({
                param: { id },
                json: data,
            });
            if (!res.ok) throw new Error("Failed to update inbox item");
            return res.json();
        },
        onSuccess: () => {
            invalidateEverywhere(queryClient, ["inbox"]);
        },
    });
}
