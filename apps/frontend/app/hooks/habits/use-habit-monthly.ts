import { useQueries, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { ApiClient } from "../../lib/api/client";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

export interface HabitMonthlyData {
    /** Days of the month (1–31) that the habit is scheduled */
    scheduledDays: number[];
    /** day number → status string */
    logsByDay: Record<number, string>;
}

function habitMonthlyQuery(client: ApiClient, habitId: string, year: number, month: number, enabled: boolean) {
    return {
        queryKey: queryKeys.habits.monthly(habitId, year, month),
        enabled: !!habitId && enabled,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits[":id"].monthly.$get({
                param: { id: habitId },
                query: { year: String(year), month: String(month) },
            });
            return unwrapResponse<HabitMonthlyData>(res);
        },
    };
}

/** Fetch a single habit's monthly log data for the calendar heatmap */
export function useHabitMonthly(habitId: string, year: number, month: number) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery(habitMonthlyQuery(client, habitId, year, month, authReady && isAuthenticated));
}

/** Monthly log data for several habits at once; results follow `habitIds` order */
export function useHabitsMonthly(habitIds: string[], year: number, month: number) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQueries({
        queries: habitIds.map((id) => habitMonthlyQuery(client, id, year, month, authReady && isAuthenticated)),
    });
}
