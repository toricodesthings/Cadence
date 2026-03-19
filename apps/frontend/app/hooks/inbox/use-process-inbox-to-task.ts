import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import type { Task } from "../../types/task";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

interface ProcessInboxParams {
    inboxItemId: string;
    rawText: string;
    /** Optional edited title — defaults to rawText if omitted */
    title?: string;
    keepNote?: boolean;
    scheduledDate?: string;
}

/**
 * Process an inbox capture into a task (C5 structured capture model):
 * 1. Create a new task (using edited title or rawText)
 * 2. Transition the capture's status to "placed" and link the task
 *    — preserves the immutable source text for audit trail
 * 3. If keepNote, mark as "kept" instead of "placed"
 */
export function useProcessInboxToTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<ProcessInboxParams, Task>(
            ({ inboxItemId, rawText, title, keepNote, scheduledDate }) => ({
                type: "process_inbox_to_task",
                payload: { inboxItemId, rawText, title, keepNote, scheduledDate },
            }),
            async ({ inboxItemId, rawText, title, keepNote = false, scheduledDate }) => {
                const taskTitle = title?.trim() || rawText;

                // Create the task — optionally scheduled
                const taskRes = await client.api.tasks.$post({
                    json: {
                        title: taskTitle,
                        orderIndex: 0,
                        state: "ACTIVE",
                        isAllDay: true,
                        ...(scheduledDate && {
                            scheduledStart: scheduledDate,
                            scheduledEnd: scheduledDate,
                        }),
                    },
                });
                const task = await unwrapResponse<Task>(taskRes);

                // Transition capture status instead of deleting — preserves source text
                await client.api.inbox[":id"].$patch({
                    param: { id: inboxItemId },
                    json: {
                        captureStatus: keepNote ? "kept" : "placed",
                        placedTaskId: task.id,
                        processed: true,
                    },
                });

                return task;
            },
        ),
        onSuccess: (_data, variables) => {
            if (!_data) return; // Queued offline
            invalidateEverywhere(queryClient, queryKeys.inbox.all);
            invalidateEverywhere(queryClient, queryKeys.tasks.all);
            const label = variables.scheduledDate
                ? `Scheduled for ${variables.scheduledDate === todayISO() ? "today" : variables.scheduledDate === tomorrowISO() ? "tomorrow" : variables.scheduledDate}`
                : variables.keepNote
                  ? "Kept as note"
                  : "Placed in tasks";
            toast.success(label);
        },
        onError: (err) => {
            toast.error(err.message || "Failed to process capture");
        },
    });
}

/** Today as YYYY-MM-DD in local time */
export function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tomorrow as YYYY-MM-DD in local time */
export function tomorrowISO(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
