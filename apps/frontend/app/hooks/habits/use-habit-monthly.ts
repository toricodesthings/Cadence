import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

export interface HabitMonthlyData {
    /** Days of the month (1–31) that the habit is scheduled */
    scheduledDays: number[];
    /** day number → status string */
    logsByDay: Record<number, string>;
}

/** Fetch a single habit's monthly log data for the calendar heatmap */
export function useHabitMonthly(habitId: string, year: number, month: number) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.habits.monthly(habitId, year, month),
        enabled: !!habitId && authReady && isAuthenticated,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (client as any).api.habits[":id"].monthly.$get({
                param: { id: habitId },
                query: { year: String(year), month: String(month) },
            });
            return unwrapResponse<HabitMonthlyData>(res);
        },
    });
}
