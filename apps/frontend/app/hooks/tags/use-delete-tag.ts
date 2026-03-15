import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";
import { unwrapResponse } from "../../lib/api/helpers";
import type { Tag } from "../../types/tag";
import { removeTagFromCaches } from "../../lib/api/cache-sync";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

export function useDeleteTag() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.tags[":id"].$delete({
                param: { id },
            });
            return unwrapResponse<Tag>(res);
        },
        onSuccess: (_tag, id) => {
            removeTagFromCaches(queryClient, id);
            invalidateEverywhere(queryClient, queryKeys.tags.all);
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete tag");
        },
    });
}
