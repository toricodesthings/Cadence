import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-keys";
import type { Habit } from "../../types/habit";
import type { HabitMonthlyData } from "./use-habit-monthly";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

/** Snapshot ALL habit caches: both the flat list and all weekly queries */
export function snapshotHabitCache(queryClient: QueryClient) {
    const allData = queryClient.getQueriesData<Habit[]>({ queryKey: queryKeys.habits.all });
    const weeklyData = queryClient.getQueriesData<Habit[]>({ queryKey: ["habits", "weekly"] });
    const monthlyData = queryClient.getQueriesData<HabitMonthlyData>({ queryKey: ["habits"] }).filter(
        ([key]) => key[2] === "monthly",
    );
    return { allData, weeklyData, monthlyData };
}

export function rollbackHabitCache(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotHabitCache>) {
    snapshot.allData.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
    });
    snapshot.weeklyData.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
    });
    snapshot.monthlyData.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
    });
}

export function invalidateHabitCaches(queryClient: QueryClient) {
    // Invalidate both the flat list and all weekly param variants
    return Promise.all([
        invalidateEverywhere(queryClient, queryKeys.habits.all),
        invalidateEverywhere(queryClient, ["habits", "weekly"]),
        invalidateEverywhere(queryClient, ["habits"]),
    ]);
}

export function cancelHabitQueries(queryClient: QueryClient) {
    return Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.habits.all }),
        queryClient.cancelQueries({ queryKey: ["habits", "weekly"] }),
        queryClient.cancelQueries({ queryKey: ["habits"] }),
    ]);
}
