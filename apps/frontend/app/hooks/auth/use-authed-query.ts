import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import type { ApiClient } from "../../lib/api/client";
import { useApiClient } from "./use-api-client";
import { useAuthState } from "./use-auth-state";

/** `useQuery` that waits for a signed-in session. `enabled` adds the caller's own condition. */
export function useAuthedQuery<TQueryFnData, TError, TData, TKey extends QueryKey>(
    options: (client: ApiClient) => UseQueryOptions<TQueryFnData, TError, TData, TKey>,
    enabled = true,
): UseQueryResult<TData, TError> {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({ ...options(client), enabled: enabled && authReady && isAuthenticated });
}
