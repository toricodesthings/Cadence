import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { TaskNote } from "@cadence/contracts/note";
import { useAuthState } from "../auth/use-auth-state";

const NOTE_KEY = (taskId: string) => ["tasks", taskId, "note"] as const;

/** Fetch a task's dedicated note (lazy load). Returns null if no note exists yet. */
export function useTaskNoteQuery(taskId: string | null) {
    const api = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: taskId ? NOTE_KEY(taskId) : ["tasks", "__none__", "note"],
        queryFn: async () => {
            if (!taskId) return null;
            const res = await (api.api.tasks as any)[":taskId"].note.$get({
                param: { taskId },
            });
            return unwrapResponse<TaskNote | null>(res);
        },
        enabled: !!taskId && authReady && isAuthenticated,
        staleTime: 30_000,
    });
}

/** Upsert a task's dedicated note body. */
export function useUpsertTaskNote(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            body,
            expectedUpdatedAt,
        }: {
            body: string;
            expectedUpdatedAt?: string;
        }) => {
            const res = await (api.api.tasks as any)[":taskId"].note.$patch({
                param: { taskId },
                json: { body, expectedUpdatedAt },
            });
            return unwrapResponse<TaskNote>(res);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(NOTE_KEY(taskId), data);
        },
    });
}

/**
 * Write any task's note, guarded by the version the writer read (0 = there was no
 * note). The server answers 409 when the note moved on since, and nothing is written.
 */
export function useWriteTaskNote() {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useCallback(
        async (taskId: string, body: string, expectedVersion: number) => {
            const res = await (api.api.tasks as any)[":taskId"].note.$patch({
                param: { taskId },
                json: { body, expectedVersion },
            });
            const note = await unwrapResponse<TaskNote>(res);
            queryClient.setQueryData(NOTE_KEY(taskId), note);
            return note;
        },
        [api, queryClient],
    );
}
