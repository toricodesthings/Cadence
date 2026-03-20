import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import type { Task } from "../../types/task";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import type { CanonicalNlpEnvelope } from "@cadence/nlp/core";

interface ProcessInboxParams {
    inboxItemId: string;
    rawText: string;
    /** Optional edited title — defaults to rawText if omitted */
    title?: string;
    keepNote?: boolean;
    scheduledDate?: string;
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
            ({ inboxItemId, rawText, title, keepNote, scheduledDate, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp }) => ({
                type: "process_inbox_to_task",
                payload: { inboxItemId, rawText, title, keepNote, scheduledDate, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp },
            }),
            async ({ inboxItemId, rawText, title, keepNote = false, scheduledDate, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp }) => {
                const taskTitle = title?.trim() || rawText;

                const taskRes = await (client.api.inbox[":id"] as any).process.$post({
                    param: { id: inboxItemId },
                    json: {
                        clientMutationId: crypto.randomUUID(),
                        title: taskTitle,
                        keepNote,
                        scheduledDate,
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
