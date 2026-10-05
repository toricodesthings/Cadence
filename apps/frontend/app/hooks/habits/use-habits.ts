import { queryOptions, useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import type { ApiClient } from "../../lib/api/client";
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

    return useQuery({
        ...habitsRangeQueryOptions(client, { start, end, archived, timezone }),
        enabled: enabled && !!start && !!end && authReady && isAuthenticated,
    });
}

/** One range's query; shared with the offline prefetch so their keys match. */
export function habitsRangeQueryOptions(client: ApiClient, { start, end, archived = false, timezone }: Omit<UseHabitsRangeOptions, "enabled">) {
    const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return queryOptions({
        queryKey: [...queryKeys.habits.weekly({ start, end, timezone: tz }), archived],
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
