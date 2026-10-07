import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { effortEvidenceRowSchema, type EffortLevel } from "@cadence/contracts/task";
import { projectEffortSuggestion, toEvidence } from "@cadence/domain/effort-evidence";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { getUserZone, today } from "../../lib/utils/user-zone";

/**
 * The Effort suggestion beside a composer's Effort control: from this account's own earlier choices, or nothing.
 * It is a recommendation only; `chosen` (the draft's own Effort: `undefined` untouched, `null` cleared) always wins.
 * Evidence loads once and is reused: not on every keystroke, and never blocking a save. Offline or still loading, there is none.
 */
export function useEffortSuggestion({ title, projectId, chosen, dismissed, literal = false, open = true }: {
    title: string;
    projectId: string | null;
    chosen: EffortLevel | undefined;
    dismissed: boolean;
    literal?: boolean;
    open?: boolean;
}) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { data: settings } = useSettings();
    const intelligence = settings?.tasks?.intelligence;
    const enabled = intelligence?.nlpEnabled !== false && intelligence?.effortSuggestions !== false;

    const { data: rows } = useQuery({
        queryKey: queryKeys.effortEvidence,
        queryFn: async () => (await unwrapResponse(await client.api.tasks["effort-evidence"].$get())).map((r) => effortEvidenceRowSchema.parse(r)),
        enabled: open && enabled && authReady && isAuthenticated,
        staleTime: 5 * 60_000,
    });
    const zone = getUserZone();
    const evidence = useMemo(() => toEvidence(rows ?? [], zone), [rows, zone]);

    return useMemo(
        () => projectEffortSuggestion({ title, projectId, evidence, today: today(), chosen, dismissed, literal, enabled, supported: true }),
        [title, projectId, evidence, chosen, dismissed, literal, enabled],
    );
}
