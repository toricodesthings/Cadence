import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { onNoteSaved } from "../../lib/notes/note-channel";

/** One compact snapshot while search is open, rather than one full-note request per task. */
export function useSearchNotes(enabled: boolean) {
    const api = useApiClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const client = useQueryClient();
    const userId = session?.user.id;
    useEffect(() => {
        if (!enabled || !userId) return;
        return onNoteSaved(userId, () => void client.invalidateQueries({ queryKey: queryKeys.notes.search }));
    }, [client, enabled, userId]);
    return useQuery({
        queryKey: queryKeys.notes.search,
        queryFn: async () => unwrapResponse(await api.api.search["task-notes"].$get()),
        enabled: enabled && authReady && isAuthenticated,
        staleTime: STALE_TIMES.NOTES,
        refetchInterval: enabled ? 10_000 : false,
    });
}
