import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";
import { removeInboxItemFromCaches } from "../../lib/api/cache-sync";
import type { Task } from "@cadence/contracts/task";
import type { InboxItem } from "@cadence/contracts/inbox";
import { toast } from "sonner";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { isPersistedId } from "../../lib/api/optimistic-id";
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
    /**
     * Skip optimistically removing the capture from the feed. Used by flows that
     * need the owning component to stay mounted until the server responds — e.g.
     * ClarifySheet's "open full editor" path depends on a per-call `onSuccess`
     * (which v5 drops once the component unmounts) to receive the new task id.
     */
    skipOptimisticRemoval?: boolean;
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
                if (!isPersistedId(inboxItemId)) {
                    // Defensive: the capture hasn't been saved yet, so it has no
                    // server id to process. Call sites disable the action while
                    // pending; this guard keeps a stray keyboard shortcut from
                    // firing a guaranteed 400 ("Invalid UUID").
                    throw new Error("Still saving this capture — try again in a moment.");
                }
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
        // Optimistically remove the capture from the holding feed the instant the
        // user places it — the backend round-trip can take several seconds, and
        // without this the item lingers and the action feels dead.
        onMutate: async ({ inboxItemId, skipOptimisticRemoval }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.inbox.all });
            const snapshot = queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });
            if (!skipOptimisticRemoval) {
                removeInboxItemFromCaches(queryClient, inboxItemId);
            }
            return { snapshot };
        },
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
        onError: (err, _variables, context) => {
            // Restore the capture we optimistically removed.
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
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
