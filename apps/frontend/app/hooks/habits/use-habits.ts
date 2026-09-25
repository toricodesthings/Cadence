import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

interface UseHabitsRangeOptions {
    start: string; // YYYY-MM-DD
    end: string;
    archived?: boolean;
    enabled?: boolean;
    timezone?: string;
}

/**
 * Routines with a log per scheduled day in [start, end] (a week, a month, or
 * just today). Every range shares the `weeklyAll` key prefix, so each
 * optimistic update covers them all.
 */
export function useHabitsRange({ start, end, archived = false, enabled = true, timezone }: UseHabitsRangeOptions) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

    return useQuery({
        queryKey: [...queryKeys.habits.weekly({ start, end }), archived],
        enabled: enabled && !!start && !!end && authReady && isAuthenticated,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.weekly.$get({
                query: { start, end, archived: String(archived), timezone: tz },
            });
            return unwrapResponse(res);
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
            const res = await client.api.habits.$get({ query: {} });
            return unwrapResponse(res);
        },
    });
}
