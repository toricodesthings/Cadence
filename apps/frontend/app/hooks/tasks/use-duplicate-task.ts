import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { Task } from "@cadence/contracts/task";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { taskCache } from "./optimistic-helpers";

/** Duplicate a task — server generates new ID, appends "(copy)" to title */
export function useDuplicateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, Task>(
            (id) => ({ type: "duplicate_task", id }),
            async (taskId) => {
                const res = await client.api.tasks[":id"].duplicate.$post({
                    param: { id: taskId },
                });
                return unwrapResponse(res);
            },
        ),

        onSuccess: () => {
            // The copy's tags are added server-side and aren't in the response.
            taskCache.invalidate(queryClient);
            toast.success("Task duplicated");
        },

        onError: (err) => {
            toast.error(err.message || "Failed to duplicate task");
        },
    });
}
