import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    snapshotHabitCache,
    rollbackHabitCache,
    invalidateHabitCaches,
    cancelHabitQueries,
} from "./optimistic-helpers";
import type { Habit, InsertHabit } from "../../types/habit";
import { toast } from "sonner";

export function useCreateHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: InsertHabit) => {
            const res = await client.api.habits.$post({
                json: input,
            });
            return unwrapResponse<Habit>(res);
        },

        onMutate: async (input) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);

            const optimisticHabit: Habit = {
                id: crypto.randomUUID(),
                userId: "",
                title: input.title,
                description: input.description ?? null,
                notes: null,
                recurrenceRule: input.recurrenceRule,
                targetTime: input.targetTime ?? null,
                reminderEnabled: input.reminderEnabled ?? false,
                colorAccent: input.colorAccent ?? "lantern",
                totalCompletions: 0,
                totalSkips: 0,
                currentStreak: 0,
                longestStreak: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                logs: [], // Will be empty until hydrated by weekly query
            };

            queryClient.setQueriesData<Habit[]>(
                { queryKey: queryKeys.habits.all },
                (old) => (old ? [...old, optimisticHabit] : [optimisticHabit]),
            );

            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to create habit");
        },

        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
