import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";

export function useDeleteTag() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.tags[":id"].$delete({
                param: { id },
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "Failed to delete tag");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete tag");
        },
    });
}
