import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import {
    snapshotHabitCache,
    rollbackHabitCache,
    invalidateHabitCaches,
    cancelHabitQueries,
} from "./optimistic-helpers";
import type { ResolveHabitAction, Habit } from "../../types/habit";
import { toast } from "sonner";

export function useResolveHabit(habitId: string) {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (action: ResolveHabitAction) => {
            const res = await client.api.habits[":id"].resolve.$post({
                param: { id: habitId },
                json: action,
            });
            return unwrapResponse<any>(res);
        },
        onMutate: async (action) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);

            // Helper to update a habit's log status in-place
            const applyUpdate = (habits: Habit[] | undefined): Habit[] | undefined => {
                if (!habits) return habits;
                return habits.map((habit) => {
                    if (habit.id !== habitId) return habit;
                    const newLogs = habit.logs?.map((log) => {
                        if (log.targetDate.substring(0, 10) === action.targetDate.substring(0, 10)) {
                            return { ...log, status: action.status };
                        }
                        return log;
                    });
                    return { ...habit, logs: newLogs };
                });
            };

            // Update the flat list (habits.all)
            queryClient.setQueriesData<Habit[]>(
                { queryKey: ["habits"] },
                applyUpdate,
            );

            // Update each weekly query variant
            queryClient.setQueriesData<Habit[]>(
                { queryKey: ["habits", "weekly"] },
                applyUpdate,
            );

            return { snapshot };
        },
        onError: (err, _action, context) => {
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err instanceof Error ? err.message : "Failed to resolve habit");
        },
        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
