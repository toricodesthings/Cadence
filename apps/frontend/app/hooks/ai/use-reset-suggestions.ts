import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RESET_SUGGESTION_MAX, type ResetDisposition, type ResetSuggestionsRequest } from "@cadence/contracts/planning";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { useOnlineStatus } from "../core/use-online-status";
import { unwrapResponse } from "../../lib/api/helpers";

const NONE: Record<string, ResetDisposition> = {};

export function useResetSuggestions(
    step: ResetSuggestionsRequest["step"],
    ids: readonly string[],
    active: boolean,
): Record<string, ResetDisposition> {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const settings = useSettings().data;
    const online = useOnlineStatus();
    const on = !!settings && settings.tasks.intelligence?.smartPlacement !== false;
    const [asked, setAsked] = useState<string[] | null>(null);
    if (active && asked === null && ids.length > 0) setAsked(ids.slice(0, RESET_SUGGESTION_MAX));
    const { data } = useQuery({
        queryKey: ["reset-suggestions", step, asked],
        enabled: on && online && authReady && isAuthenticated && !!asked?.length,
        staleTime: Infinity,
        retry: false,
        queryFn: async () => unwrapResponse(await client.api.ai.decisions.reset.$post({ json: { step, ids: asked! } })),
    });
    return on ? (data?.suggestions ?? NONE) : NONE;
}
