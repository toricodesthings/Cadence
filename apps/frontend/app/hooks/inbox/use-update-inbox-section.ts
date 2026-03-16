import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { UpdateInboxSection } from "@cadence/backend/types/inbox";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

export function useUpdateInboxSection() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { id: string } & UpdateInboxSection,
            unknown
        >(
            ({ id, ...data }) => ({ type: "update_inbox_section", id, payload: data as Record<string, unknown> }),
            async ({ id, ...data }) => {
                const res = await api.api.inbox.sections[":id"].$patch({
                    param: { id },
                    json: data,
                });
                if (!res.ok) throw new Error("Failed to update inbox section");
                return res.json();
            },
        ),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox_sections"] });
        },
    });
}
