import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import { removeTaskFromCaches } from "../../lib/api/cache-sync";
import type { Task } from "@cadence/contracts/task";
import type { InboxItem } from "@cadence/contracts/inbox";

export function useUnprocessInbox() {
    const client = useApiClient();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: async ({ id }: { id: string; taskId: string; item?: InboxItem }) =>
            unwrapResponse<InboxItem>(await client.api.inbox[":id"].unprocess.$post({ param: { id } })),
        onMutate: async ({ taskId, item }) => {
            await Promise.all([
                cache.cancelQueries({ queryKey: queryKeys.tasks.all }),
                cache.cancelQueries({ queryKey: queryKeys.inbox.all }),
            ]);
            const tasks = cache.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all });
            const inbox = cache.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });
            removeTaskFromCaches(cache, taskId);
            if (item)
                cache.setQueryData<InboxItem[]>(queryKeys.inbox.all, (old) => [
                    { ...item, processed: false, captureStatus: "clarifying", placedTaskId: null },
                    ...(old ?? []).filter((i) => i.id !== item.id),
                ]);
            return { tasks, inbox };
        },
        onSuccess: (item) => {
            cache.setQueryData<InboxItem[]>(queryKeys.inbox.all, (old) => [
                item,
                ...(old ?? []).filter((i) => i.id !== item.id),
            ]);
        },
        onError: (_error, _variables, context) => {
            for (const [key, value] of [...(context?.tasks ?? []), ...(context?.inbox ?? [])])
                cache.setQueryData(key, value);
            toast.error("Couldn't undo. Try again.");
        },
        onSettled: () => {
            invalidateEverywhere(cache, queryKeys.inbox.all);
            invalidateEverywhere(cache, queryKeys.tasks.all);
        },
    });
}
