import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { Habit } from "../../types/habit";
import { useAuthState } from "../auth/use-auth-state";

interface UseHabitsWeeklyOptions {
    start: string; // YYYY-MM-DD
    end: string;
    archived?: boolean;
    enabled?: boolean;
}

/** Fetch habits for the weekly grid, including their generated virtual instance logs. */
export function useHabitsWeekly({ start, end, archived = false, enabled = true }: UseHabitsWeeklyOptions) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: [...queryKeys.habits.weekly({ start, end }), archived],
        enabled: enabled && !!start && !!end && authReady && isAuthenticated,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.weekly.$get({
                query: { start, end, archived: String(archived) },
            });
            return unwrapResponse<Habit[]>(res);
        },
    });
}

/** Fetch all habits base settings, unconditionally */
export function useAllHabits() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.habits.all,
        enabled: authReady && isAuthenticated,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.$get();
            return unwrapResponse<Habit[]>(res);
        },
    });
}
