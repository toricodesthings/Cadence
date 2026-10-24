import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { effortEvidenceRowSchema, type Task } from "@cadence/contracts/task";
import { toEvidence } from "@cadence/domain/effort-evidence";
import { effortGuessOf, type EffortGuess } from "@cadence/domain/effort-guess";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { getUserZone, today } from "../../lib/utils/user-zone";

export type GuessOf = (task: Pick<Task, "effort" | "effortGuess" | "effortGuessSource" | "title" | "projectId">) => EffortGuess | null;

/** This account's own Effort choices as evidence, and whether Effort suggestions are on. Loads once; offline or loading, empty. */
export function useEffortEvidence(open = true) {
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
    return { evidence, enabled };
}

/**
 * The Effort Cadence guesses for a task (never its Effort): read by day load and quick-win ranking, shown as `~` where
 * Effort is set. Off with Effort suggestions.
 */
export function useEffortGuess(): GuessOf {
    const { evidence, enabled } = useEffortEvidence();
    return useCallback(
        (task) => (enabled ? effortGuessOf({ ...task, effort: task.effort ?? null }, evidence, today()) : null),
        [enabled, evidence],
    );
}
