import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-keys";
import type { Habit } from "../../types/habit";

/** Snapshot ALL habit caches: both the flat list and all weekly queries */
export function snapshotHabitCache(queryClient: QueryClient) {
    const allData = queryClient.getQueriesData<Habit[]>({ queryKey: queryKeys.habits.all });
    const weeklyData = queryClient.getQueriesData<Habit[]>({ queryKey: ["habits", "weekly"] });
    return { allData, weeklyData };
}

export function rollbackHabitCache(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotHabitCache>) {
    snapshot.allData.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
    });
    snapshot.weeklyData.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
    });
}

export function invalidateHabitCaches(queryClient: QueryClient) {
    // Invalidate both the flat list and all weekly param variants
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.habits.all }),
        queryClient.invalidateQueries({ queryKey: ["habits", "weekly"] }),
    ]);
}

export function cancelHabitQueries(queryClient: QueryClient) {
    return Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.habits.all }),
        queryClient.cancelQueries({ queryKey: ["habits", "weekly"] }),
    ]);
}
