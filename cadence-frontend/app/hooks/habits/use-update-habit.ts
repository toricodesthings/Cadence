import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import {
    snapshotHabitCache,
    rollbackHabitCache,
    invalidateHabitCaches,
    cancelHabitQueries,
} from "./optimistic-helpers";
import type { Habit, UpdateHabit } from "../../types/habit";
import { toast } from "sonner";

export function useUpdateHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...patch }: UpdateHabit & { id: string }) => {
            const res = await client.api.habits[":id"].$patch({
                param: { id },
                json: patch,
            });
            return unwrapResponse<Habit>(res);
        },

        onMutate: async ({ id, ...patch }) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);

            const apply = (old: Habit[] | undefined): Habit[] | undefined => {
                if (!old) return old;
                return old.map((h) => h.id === id ? { ...h, ...patch } : h);
            };

            queryClient.setQueriesData<Habit[]>({ queryKey: ["habits"] }, apply);
            queryClient.setQueriesData<Habit[]>({ queryKey: ["habits", "weekly"] }, apply);

            return { snapshot };
        },

        onError: (err, _vars, context) => {
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err instanceof Error ? err.message : "Failed to update habit");
        },

        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
