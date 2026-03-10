import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import type { UpdateInboxSection } from "@cadence/backend/types/inbox";

export function useUpdateInboxSection() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...data }: { id: string } & UpdateInboxSection) => {
            const res = await api.inbox.sections[":id"].$patch({
                param: { id },
                json: data,
            });
            if (!res.ok) throw new Error("Failed to update inbox section");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox_sections"] });
        },
    });
}
