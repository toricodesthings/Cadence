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
