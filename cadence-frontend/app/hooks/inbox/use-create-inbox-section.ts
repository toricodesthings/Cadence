import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import type { InsertInboxSection } from "../../../../cadence-backend/src/types/inbox";

export function useCreateInboxSection() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: InsertInboxSection) => {
            const res = await api.inbox.sections.$post({
                json: data,
            });
            if (!res.ok) throw new Error("Failed to create inbox section");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox_sections"] });
        },
    });
}
