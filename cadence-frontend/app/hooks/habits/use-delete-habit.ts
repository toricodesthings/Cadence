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

export function useDeleteHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.habits[":id"].$delete({
                param: { id },
            });
            return unwrapResponse(res);
        },

        onMutate: async (id) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);

            // Remove from both flat list and weekly caches
            const remove = (old: any[] | undefined) =>
                old ? old.filter((h) => h.id !== id) : [];

            queryClient.setQueriesData<any[]>({ queryKey: ["habits"] }, remove);
            queryClient.setQueriesData<any[]>({ queryKey: ["habits", "weekly"] }, remove);

            return { snapshot };
        },

        onError: (err, _id, context) => {
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err instanceof Error ? err.message : "Failed to delete habit");
        },

        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
