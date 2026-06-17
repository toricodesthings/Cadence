import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import type { UnresolvedHabitSummary } from "@cadence/contracts/habit";
import { useAuthState } from "../auth/use-auth-state";

/** Fetch unresolved habit summaries (yesterday + today recovery window). */
export function useHabitUnresolvedSummary(timezone?: string) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.habits.unresolved,
        enabled: authReady && isAuthenticated,
        staleTime: STALE_TIMES.HABITS,
        queryFn: async () => {
            const res = await client.api.habits.unresolved.$get({
                query: { timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone },
            });
            return unwrapResponse<UnresolvedHabitSummary[]>(res);
        },
    });
}
