import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

export function useDeleteInboxSection() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, unknown>(
            (id) => ({ type: "delete_inbox_section", id }),
            async (id) => {
                const res = await api.api.inbox.sections[":id"].$delete({
                    param: { id },
                });
                if (!res.ok) throw new Error("Failed to delete inbox section");
                return res.json();
            },
        ),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox_sections"] });
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}
