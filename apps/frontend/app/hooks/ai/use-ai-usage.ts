/**
 * AI usage budget (GET /ai/usage) — rate-limit transparency.
 *
 * The backend meters chat on rolling 5h/7d request+token windows; this hook
 * lets the panel show "≈ N messages left · resets in …" BEFORE a 429 instead
 * of only at rejection. Refetched by the panel after each completed turn
 * (invalidate on streaming → ready), so the numbers track real spend.
 */
import { useQuery } from "@tanstack/react-query";
import type { AiUsage } from "@cadence/contracts/ai";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";

export function useAiUsage(enabled: boolean) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: queryKeys.ai.usage,
        enabled: enabled && authReady && isAuthenticated,
        staleTime: 15_000,
        queryFn: async () => {
            const res = await client.api.ai.usage.$get();
            return unwrapResponse<AiUsage>(res);
        },
    });
}
