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
import { patchHabitMonthlyCache, reconcileHabitInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { toISODate } from "../../lib/utils/date-format";

const latestResolveByCell = new Map<string, string>();

function makeCellKey(habitId: string, targetDate: string) {
    return `${habitId}:${toISODate(new Date(targetDate))}`;
}

export function useResolveHabit(habitId: string) {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (action: ResolveHabitAction) => {
            const requestKey = makeCellKey(habitId, action.targetDate);
            const requestId = crypto.randomUUID();
            latestResolveByCell.set(requestKey, requestId);
            const res = await client.api.habits[":id"].resolve.$post({
                param: { id: habitId },
                json: action,
            });
            return {
                ...(await unwrapResponse<{ habit: Habit }>(res)),
                requestId,
                requestKey,
            };
        },
        onMutate: async (action) => {
            await cancelHabitQueries(queryClient);
            const snapshot = snapshotHabitCache(queryClient);
            const requestKey = makeCellKey(habitId, action.targetDate);

            // Helper to update a habit's log status in-place
            const applyUpdate = (habits: Habit[] | undefined): Habit[] | undefined => {
                return transformListCache(habits, (items) =>
                    items.map((habit) => {
                        if (habit.id !== habitId) return habit;
                        const newLogs = habit.logs?.map((log) => {
                            if (log.targetDate.substring(0, 10) === action.targetDate.substring(0, 10)) {
                                return { ...log, status: action.status };
                            }
                            return log;
                        });
                        return { ...habit, logs: newLogs };
                    }),
                );
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

            return { snapshot, requestKey };
        },
        onSuccess: (result, action, context) => {
            if (latestResolveByCell.get(result.requestKey) !== result.requestId) {
                return;
            }
            reconcileHabitInCaches(queryClient, result.habit);
            patchHabitMonthlyCache(queryClient, habitId, action.targetDate, action.status);
            latestResolveByCell.delete(result.requestKey);
        },
        onError: (err, _action, context) => {
            if (context?.requestKey) {
                latestResolveByCell.delete(context.requestKey);
            }
            if (context?.snapshot) rollbackHabitCache(queryClient, context.snapshot);
            toast.error(err instanceof Error ? err.message : "Failed to resolve habit");
        },
        onSettled: () => invalidateHabitCaches(queryClient),
    });
}
