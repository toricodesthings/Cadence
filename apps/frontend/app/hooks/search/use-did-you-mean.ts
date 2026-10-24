import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { unwrapResponse } from "../../lib/api/helpers";

/** How long a query must sit unchanged, with nothing found, before one model call is made. */
const PAUSE_MS = 700;

/**
 * "Did you mean…": the task a failed search probably meant. Mounted only under "No results", it asks after a typing
 * pause (never per keystroke), only when the Suggest with an AI provider switch is on, and never replaces results.
 */
export function useDidYouMean(query: string): { id: string; title: string } | null {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    // Off until settings have loaded, so nothing is sent before the switch is known.
    const settings = useSettings().data;
    const on = !!settings && settings.tasks.intelligence?.smartPlacement !== false;
    const [settled, setSettled] = useState("");

    useEffect(() => {
        if (!query) {
            setSettled("");
            return;
        }
        const timer = setTimeout(() => setSettled(query), PAUSE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    const { data } = useQuery({
        queryKey: ["did-you-mean", settled],
        enabled: on && authReady && isAuthenticated && settled !== "" && settled === query,
        staleTime: 5 * 60_000,
        retry: false,
        queryFn: async () => unwrapResponse(await client.api.search["did-you-mean"].$post({ json: { query: settled } })),
    });
    // A cached answer stays in the query cache after the switch goes off; never show it then.
    return on && settled === query ? (data?.task ?? null) : null;
}
