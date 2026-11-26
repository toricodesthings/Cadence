import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { unwrapResponse } from "../../lib/api/helpers";

const PAUSE_MS = 700;

export function useDidYouMean(query: string): { id: string; title: string } | null {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
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
        queryFn: async () =>
            unwrapResponse(await client.api.search["did-you-mean"].$post({ json: { query: settled } })),
    });
    return on && settled === query ? (data?.task ?? null) : null;
}
