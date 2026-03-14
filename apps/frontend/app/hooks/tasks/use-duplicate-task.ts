import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { invalidateTaskCaches } from "./optimistic-helpers";
import type { Task } from "../../types/task";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

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
                return unwrapResponse<Task>(res);
            },
        ),

        onSuccess: () => {
            toast.success("Task duplicated");
        },

        onError: (err) => {
            toast.error(err.message || "Failed to duplicate task");
        },

        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
