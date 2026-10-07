import { useQuery } from "@tanstack/react-query";
import { apiClient, type ApiClient } from "../../lib/api/client";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { useAuthState } from "../auth/use-auth-state";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import type { NoteSavePayload } from "../../lib/api/offline-wal";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

/** Fresh from the server (no cache). `null` = this task has no dedicated note yet. */
export async function fetchTaskNote(ownerId: string, client: ApiClient = apiClient) {
    return unwrapResponse(await client.api.tasks[":taskId"].note.$get({ param: { taskId: ownerId } }));
}

export type TaskNoteData = Awaited<ReturnType<typeof fetchTaskNote>>;

/** One save, guarded by the revision it builds on and retry-safe through its operation id. */
export function saveTaskNote(ownerId: string, { body, expectedVersion, expectedUpdatedAt, opId }: NoteSavePayload) {
    return apiClient.api.tasks[":taskId"].note.$patch(
        { param: { taskId: ownerId }, json: { body, expectedVersion, expectedUpdatedAt } },
        opId ? { headers: { "Idempotency-Key": opId } } : undefined,
    ).then(unwrapResponse);
}

/** Offline, the text is queued and returns `undefined`; online it is the saved note. */
export const sendTaskNote = (ownerId: string) =>
    withOfflineSupport<NoteSavePayload, NonNullable<TaskNoteData>>(
        (payload) => ({ type: "upsert_note", taskId: ownerId, payload }),
        (payload) => saveTaskNote(ownerId, payload),
    );

/**
 * A task's dedicated note. While `live` (a note is open and visible) it re-reads every
 * 10 seconds, plus on focus and reconnect, to catch writes from other devices or the
 * assistant that no broadcast reaches. The note session decides what to do with the result.
 */
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
