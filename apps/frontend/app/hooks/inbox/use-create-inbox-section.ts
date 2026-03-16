import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { InsertInboxSection } from "@cadence/backend/types/inbox";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

export function useCreateInboxSection() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<InsertInboxSection, unknown>(
            (data) => ({
                type: "create_inbox_section",
                payload: { name: data.name, orderIndex: data.orderIndex, clientMutationId: crypto.randomUUID() },
            }),
            async (data) => {
                const res = await api.api.inbox.sections.$post({
                    json: data,
                });
                if (!res.ok) throw new Error("Failed to create inbox section");
                return res.json();
            },
        ),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox_sections"] });
        },
    });
}
