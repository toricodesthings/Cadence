import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { Habit } from "../../types/habit";

interface UseHabitsWeeklyOptions {
    start: string; // YYYY-MM-DD
    end: string;
    enabled?: boolean;
}

/** Fetch habits for the weekly grid, including their generated virtual instance logs. */
export function useHabitsWeekly({ start, end, enabled = true }: UseHabitsWeeklyOptions) {
    const client = useApiClient();

    return useQuery({
        queryKey: queryKeys.habits.weekly({ start, end }),
        enabled: enabled && !!start && !!end,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.weekly.$get({
                query: { start, end },
            });
            return unwrapResponse<Habit[]>(res);
        },
    });
}

/** Fetch all habits base settings, unconditionally */
export function useAllHabits() {
    const client = useApiClient();

    return useQuery({
        queryKey: queryKeys.habits.all,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.$get();
            return unwrapResponse<Habit[]>(res);
        },
    });
}
