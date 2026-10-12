import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { reconcileTaskInCaches, removeInboxItemFromCaches, removeTaskFromCaches } from "../../lib/api/cache-sync";
import { taskCache } from "../tasks/optimistic-helpers";
import { buildOptimisticTask } from "../tasks/use-create-task";
import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import type { Task, TaskPriority } from "@cadence/contracts/task";
import type { Project } from "@cadence/contracts/project";
import type { InboxItem } from "@cadence/contracts/inbox";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { placementLabel, placementReceipt } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";
import { useUnprocessInbox } from "./use-unprocess-inbox";
import { toastError } from "../../lib/utils/error-toast";
import type { ProcessInboxPayload } from "../../lib/api/offline-wal";

interface ProcessInboxParams extends ProcessInboxPayload {
    /** The toast's text, instead of where the task landed. */
    successLabel?: string;
    /**
     * Skip optimistically removing the capture from the feed. Used by flows that
     * need the owning component to stay mounted until the server responds — e.g.
     * ClarifySheet's "open full editor" path depends on a per-call `onSuccess`
     * (which v5 drops once the component unmounts) to receive the new task id.
     */
    skipOptimisticRemoval?: boolean;
}

/** What is sent (and queued offline): everything but the client-side options. */
const toPayload = ({ successLabel: _label, skipOptimisticRemoval: _skip, ...payload }: ProcessInboxParams): ProcessInboxPayload => payload;

/**
 * Process an inbox capture into a task (C5 structured capture model):
 * Uses the backend atomic inbox→task endpoint so the task and inbox transition
 * happen in one transaction instead of a split create + patch flow.
 */
export function useProcessInboxToTask() {
    const client = useApiClient();
    const unprocess = useUnprocessInbox();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<ProcessInboxParams, Task>(
            (params) => ({ type: "process_inbox_to_task", payload: toPayload(params) }),
            async (params) => {
                const { inboxItemId, rawText, title, ...fields } = toPayload(params);
                const res = await client.api.inbox[":id"].process.$post({ param: { id: inboxItemId }, json: { ...fields, title: title?.trim() || rawText } });
                return unwrapResponse(res);
            },
        ),
        // The capture leaves the feed and the task lands in its view the instant it's placed: the round-trip can take
        // seconds, and offline it waits for sync. Nothing passes through an in-between state on screen.
        onMutate: async (params) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.inbox.all });
            const snapshot = queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });
            if (params.skipOptimisticRemoval) return { snapshot };
            removeInboxItemFromCaches(queryClient, params.inboxItemId);
            if (params.complete) return { snapshot };
            await taskCache.cancel(queryClient);
            const optimistic = buildOptimisticTask(crypto.randomUUID(), {
                title: params.title?.trim() || params.rawText,
                orderIndex: 0,
                state: params.waitingOn ? "WAITING" : "ACTIVE",
                dueDate: params.dueDate ?? params.scheduledDay ?? null,
                endDate: params.endDate ?? null,
                scheduledStart: params.scheduledStart ?? null,
                scheduledEnd: params.scheduledEnd ?? null,
                projectId: params.projectId ?? null,
                sectionId: params.sectionId ?? null,
                tagIds: params.tagIds ?? [],
                priority: (params.priority ?? 0) as TaskPriority,
                recurrenceRule: params.recurrenceRule ?? null,
                waitingOn: params.waitingOn ?? null,
                reminderAt: params.reminderAt ?? null,
                notBefore: params.notBefore ?? null,
                durationEstimate: params.durationEstimate ?? null,
            });
            reconcileTaskInCaches(queryClient, optimistic);
            return { snapshot, optimisticId: optimistic.id };
        },
        onSuccess: (_data, variables, context) => {
            if (!_data) return; // Queued offline: the optimistic task stays until sync.
            reconcileTaskInCaches(queryClient, _data, context?.optimisticId);
            queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
            const scheduledLabel = _data.scheduledStart ?? _data.dueDate ?? variables.scheduledStart ?? variables.scheduledDay ?? variables.dueDate;
            const listName = _data.projectId ? queryClient.getQueryData<Project[]>(queryKeys.projects.all)?.find((project) => project.id === _data.projectId)?.name : null;
            // Every placement says where it went: its list, or the view that shows its day. A Waiting or hidden task
            // isn't in that view, so it gets the day alone.
            const shown = _data.state === "ACTIVE" && !(_data.notBefore && _data.notBefore > today());
            const label = variables.successLabel ?? (variables.complete ? "Ticked off"
                : scheduledLabel ? (shown ? placementReceipt(scheduledLabel, listName) : placementLabel(scheduledLabel))
                : listName ? `In ${listName}` : "No day yet");
            // It left the screen, so the toast names it and says where it went.
            toastUndo(toastName(_data.title), () => unprocess.mutate({
                id: variables.inboxItemId,
                taskId: _data.id,
                item: context?.snapshot.flatMap(([, items]) => items ?? []).find((item) => item.id === variables.inboxItemId),
            }), { description: label });
        },
        onError: (err, _variables, context) => {
            // Restore the capture we optimistically removed, and take back the task we showed.
            if (context?.optimisticId) removeTaskFromCaches(queryClient, context.optimisticId);
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toastError(err, "Couldn't process capture");
        },
    });
}

export const todayISO = (): LocalDate => today();
export const tomorrowISO = (): LocalDate => addDays(today(), 1);
