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
import { reconcileHabitInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { queryKeys } from "../../lib/api/query-keys";

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
                return transformListCache(old, (items) =>
                    items.map((h) => h.id === id ? { ...h, ...patch } : h),
                );
            };

            queryClient.setQueriesData<Habit[]>({ queryKey: queryKeys.habits.all }, apply);

            queryClient
                .getQueriesData<Habit[]>({ queryKey: ["habits", "weekly"] })
                .forEach(([key, old]) => {
                    const archivedFlag = key.at(-1);
                    const shouldInclude = patch.archived === undefined || archivedFlag === patch.archived;
                    const withoutTarget = transformListCache(old, (items) => items.filter((habit) => habit.id !== id));

                    if (!shouldInclude) {
                        queryClient.setQueryData(key, withoutTarget);
                        return;
                    }

                    queryClient.setQueryData(
                        key,
                        transformListCache(withoutTarget, (items) => {
                            const existing = old?.find((habit) => habit.id === id);
                            if (!existing) return items;
                            return [...items, { ...existing, ...patch }];
                        }),
                    );
                });

            return { snapshot };
        },

        onSuccess: (habit) => {
            reconcileHabitInCaches(queryClient, habit);
        },

        onError: (err, _vars, context) => {
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err instanceof Error ? err.message : "Failed to update habit");
        },

        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
