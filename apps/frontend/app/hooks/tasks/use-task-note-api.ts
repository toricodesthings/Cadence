import { useQuery } from "@tanstack/react-query";
import { apiClient, type ApiClient } from "../../lib/api/client";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { useAuthState } from "../auth/use-auth-state";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import type { NoteSavePayload } from "../../lib/api/offline-wal";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

export async function fetchTaskNote(ownerId: string, client: ApiClient = apiClient) {
    return unwrapResponse(await client.api.tasks[":taskId"].note.$get({ param: { taskId: ownerId } }));
}

export type TaskNoteData = Awaited<ReturnType<typeof fetchTaskNote>>;

export function saveTaskNote(ownerId: string, { body, expectedVersion, expectedUpdatedAt, opId }: NoteSavePayload) {
    return apiClient.api.tasks[":taskId"].note
        .$patch(
            { param: { taskId: ownerId }, json: { body, expectedVersion, expectedUpdatedAt } },
            opId ? { headers: { "Idempotency-Key": opId } } : undefined,
        )
        .then(unwrapResponse);
}

export const sendTaskNote = (ownerId: string) =>
    withOfflineSupport<NoteSavePayload, NonNullable<TaskNoteData>>(
        (payload) => ({ type: "upsert_note", taskId: ownerId, payload }),
        (payload) => saveTaskNote(ownerId, payload),
    );

export function useTaskNoteQuery(ownerId: string | null, { live = false }: { live?: boolean } = {}) {
    const { authReady, isAuthenticated } = useAuthState();
    const api = useApiClient();
    return useQuery({
        queryKey: queryKeys.notes.detail(ownerId ?? "__none__"),
        queryFn: () => fetchTaskNote(ownerId!, api),
        enabled: !!ownerId && authReady && isAuthenticated,
        staleTime: STALE_TIMES.NOTES,
        refetchInterval: live ? 10_000 : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: live,
        refetchOnReconnect: live,
    });
}
