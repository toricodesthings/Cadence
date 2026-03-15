import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import type { Task } from "../../types/task";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/**
 * Process an inbox item into a task:
 * 1. Create a new task from the rawText
 * 2. Delete the inbox item (or mark processed)
 */
export function useProcessInboxToTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { inboxItemId: string; rawText: string; keepNote?: boolean },
            Task
        >(
            ({ inboxItemId, rawText, keepNote }) => ({
                type: "process_inbox_to_task",
                payload: { inboxItemId, rawText, keepNote },
            }),
            async ({ inboxItemId, rawText, keepNote = false }) => {
                // Create the task
                const taskRes = await client.api.tasks.$post({
                    json: {
                        title: rawText,
                        orderIndex: 0,
                        state: "ACTIVE",
                        isAllDay: true,
                    },
                });
                const task = await unwrapResponse<Task>(taskRes);

                // Delete the inbox item unless keeping as note
                if (!keepNote) {
                    await client.api.inbox[":id"].$delete({
                        param: { id: inboxItemId },
                    });
                }

                return task;
            },
        ),
        onSuccess: (_data, variables) => {
            if (!_data) return; // Queued offline
            invalidateEverywhere(queryClient, queryKeys.inbox.all);
            invalidateEverywhere(queryClient, queryKeys.tasks.all);
            toast.success(variables.keepNote ? "Task created (note kept)" : "Inbox item converted to task");
        },
        onError: (err) => {
            toast.error(err.message || "Failed to process inbox item");
        },
    });
}
