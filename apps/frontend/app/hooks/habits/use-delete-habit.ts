import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import {
    snapshotHabitCache,
    rollbackHabitCache,
    invalidateHabitCaches,
    cancelHabitQueries,
} from "./optimistic-helpers";
import { toast } from "sonner";
import { removeHabitFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

export function useDeleteHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, unknown>(
            (id) => ({ type: "delete_habit", id }),
            async (id) => {
                const res = await client.api.habits[":id"].$delete({
                    param: { id },
                });
                return unwrapResponse(res);
            },
        ),

        onMutate: async (id) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);

            // Remove from both flat list and weekly caches
            const remove = <T extends { id: string }>(old: T[] | undefined) =>
                transformListCache(old, (items) => items.filter((h) => h.id !== id));

            queryClient.setQueriesData<{ id: string }[]>({ queryKey: ["habits"] }, remove);
            queryClient.setQueriesData<{ id: string }[]>({ queryKey: ["habits", "weekly"] }, remove);

            return { snapshot };
        },

        onSuccess: (_data, id) => {
            removeHabitFromCaches(queryClient, id);
        },

        onError: (err, _id, context) => {
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err instanceof Error ? err.message : "Failed to delete habit");
        },

        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
