import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import type { Task } from "@cadence/contracts/task";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import type { CanonicalNlpEnvelope } from "@cadence/nlp/core";

interface ProcessInboxParams {
    inboxItemId: string;
    rawText: string;
    /** Optional edited title — defaults to rawText if omitted */
    title?: string;
    scheduledDate?: string;
    dueDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    isAllDay?: boolean | null;
    projectId?: string | null;
    tagIds?: string[];
    priority?: number | null;
    durationEstimate?: number | null;
    recurrenceRule?: string | null;
    waitingOn?: string | null;
    nlp?: CanonicalNlpEnvelope;
}

/**
 * Process an inbox capture into a task (C5 structured capture model):
 * Uses the backend atomic inbox→task endpoint so the task and inbox transition
 * happen in one transaction instead of a split create + patch flow.
 */
export function useProcessInboxToTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<ProcessInboxParams, Task>(
            ({ inboxItemId, rawText, title, scheduledDate, dueDate, scheduledStart, scheduledEnd, isAllDay, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp }) => ({
                type: "process_inbox_to_task",
                payload: { inboxItemId, rawText, title, scheduledDate, dueDate, scheduledStart, scheduledEnd, isAllDay, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp },
            }),
            async ({ inboxItemId, rawText, title, scheduledDate, dueDate, scheduledStart, scheduledEnd, isAllDay, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp }) => {
                const taskTitle = title?.trim() || rawText;

                const taskRes = await (client.api.inbox[":id"] as any).process.$post({
                    param: { id: inboxItemId },
                    json: {
                        clientMutationId: crypto.randomUUID(),
                        title: taskTitle,
                        scheduledDate,
                        dueDate,
                        scheduledStart,
                        scheduledEnd,
                        isAllDay,
                        projectId,
                        tagIds,
                        priority,
                        durationEstimate,
                        recurrenceRule,
                        waitingOn,
                        nlp,
                    },
                });
                const task = await unwrapResponse<Task>(taskRes);

                return task;
            },
        ),
        onSuccess: (_data, variables) => {
            if (!_data) return; // Queued offline
            invalidateEverywhere(queryClient, queryKeys.inbox.all);
            invalidateEverywhere(queryClient, queryKeys.tasks.all);
            const scheduledLabel = variables.scheduledStart ?? variables.dueDate ?? variables.scheduledDate;
            const label = scheduledLabel
                ? `Scheduled for ${scheduledLabel === todayISO() ? "today" : scheduledLabel === tomorrowISO() ? "tomorrow" : scheduledLabel}`
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
