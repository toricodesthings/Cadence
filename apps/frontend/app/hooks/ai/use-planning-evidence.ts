import { useQuery } from "@tanstack/react-query";
import { planningEvidenceSchema, type PlanningEvidence } from "@cadence/contracts/planning";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";

export function usePlanningEvidence(): PlanningEvidence | undefined {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { data: settings } = useSettings();
    const on = settings?.assistant?.memoryMode !== "off";
    const { data } = useQuery({
        queryKey: queryKeys.ai.planningEvidence,
        enabled: on && authReady && isAuthenticated,
        staleTime: 5 * 60_000,
        retry: false,
        queryFn: async () =>
            planningEvidenceSchema.parse(await unwrapResponse(await client.api.ai.memory["planning-evidence"].$get())),
    });
    return on ? data : undefined;
}
