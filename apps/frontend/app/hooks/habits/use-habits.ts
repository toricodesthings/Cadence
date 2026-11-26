import { queryOptions, useQuery } from "@tanstack/react-query";
import { useAuthedQuery } from "../auth/use-authed-query";
import { useApiClient } from "../auth/use-api-client";
import type { ApiClient } from "../../lib/api/client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { LocalDate } from "@cadence/domain/time";
import { useAuthState } from "../auth/use-auth-state";

interface UseHabitsRangeOptions {
    start: LocalDate;
    end: LocalDate;
    archived?: boolean;
    enabled?: boolean;
}

export function useHabitsRange({ start, end, archived = false, enabled = true }: UseHabitsRangeOptions) {
    return useAuthedQuery(
        (client) => habitsRangeQueryOptions(client, { start, end, archived }),
        enabled && !!start && !!end,
    );
}

export function habitsRangeQueryOptions(
    client: ApiClient,
    { start, end, archived = false }: Omit<UseHabitsRangeOptions, "enabled">,
) {
    return queryOptions({
        queryKey: [...queryKeys.habits.weekly({ start, end }), archived],
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.weekly.$get({
                query: { start, end, archived: String(archived) },
            });
            return unwrapResponse(res);
        },
    });
}

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
