import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { habitCache } from "./optimistic-helpers";
import { removeHabitFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, undoWindow } from "../../lib/utils/undo-toast";

export function useDeleteHabit() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const send = withOfflineSupport<{ id: string; name: string }, unknown>(
        ({ id }) => ({ type: "delete_habit", id }),
        async ({ id }) => {
            const res = await client.api.habits[":id"].$delete({ param: { id } });
            return unwrapResponse(res);
        },
    );

    return useMutation({
        // The routine disappears at once; the delete is sent (or queued offline) once Undo's window closes.
        mutationFn: async (input: { id: string; name: string }) => {
            await undoWindow(`Deleted ${input.name}`, { description: "Its history went with it." });
            return send(input);
        },

        onMutate: async ({ id }) => {
            await habitCache.cancel(queryClient);
            const snapshot = habitCache.snapshot(queryClient);

            // Remove from both flat list and weekly caches
            const remove = <T extends { id: string }>(old: T[] | undefined) =>
                transformListCache(old, (items) => items.filter((h) => h.id !== id));

            queryClient.setQueriesData<{ id: string }[]>({ queryKey: queryKeys.habits.all }, remove);
            queryClient.setQueriesData<{ id: string }[]>({ queryKey: queryKeys.habits.weeklyAll }, remove);

            return { snapshot };
        },

        onSuccess: (_data, { id }) => {
            removeHabitFromCaches(queryClient, id);
        },

        onError: (err, _id, context) => {
            if (context?.snapshot) habitCache.rollback(queryClient, context.snapshot);
            if (!isUndone(err)) toastError(err, "Couldn't delete routine");
        },

        onSettled: (data, error) => !wasQueued(data, error) && habitCache.invalidate(queryClient),
    });
}
