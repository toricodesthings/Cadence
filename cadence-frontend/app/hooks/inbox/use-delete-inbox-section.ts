import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";

export function useDeleteInboxSection() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.inbox.sections[":id"].$delete({
                param: { id },
            });
            if (!res.ok) throw new Error("Failed to delete inbox section");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox_sections"] });
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}
