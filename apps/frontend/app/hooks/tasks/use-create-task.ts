import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { taskCache } from "./optimistic-helpers";
import type { CreateTaskInput, Task } from "@cadence/contracts/task";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { isRecurringTask } from "../../lib/utils/task/task-scheduling";
import { suggestInteractionMode } from "@cadence/domain/repeats";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { ApiErrorResponse } from "../../types/api";
import { toastError } from "../../lib/utils/error-toast";
import { clientIdFor } from "../../lib/api/optimistic-id";
import { getUserZone } from "../../lib/utils/user-zone";

/** The row a new task shows as until the server answers (a create, or a capture placed as a task). */
export function buildOptimisticTask(id: string, input: CreateTaskInput): Task {
    const {
        projectId = null, sectionId = null, tagIds = [], content = null, state = "ACTIVE", dueDate = null, endDate = null,
        scheduledStart = null, scheduledEnd = null, durationEstimate = null, timezoneLocked = false, priority = 0,
        isPinned = false, reminderAt = null, reminderSilenced = false, recurrenceRule = null,
        interactionMode = suggestInteractionMode(input), effort = null, waitingOn = null, waitingReminder = null, notBefore = null,
    } = input;
    return {
        id,
        userId: "",
        projectId,
        sectionId,
        tagIds,
        title: input.title,
        content,
        state,
        orderIndex: input.orderIndex,
        dueDate,
        endDate,
        scheduledStart,
        scheduledEnd,
        zone: scheduledStart ? input.zone ?? getUserZone() : null,
        durationEstimate,
        timezoneLocked,
        priority,
        isPinned,
        reminderAt,
        reminderSilenced,
        recurrenceRule,
        interactionMode,
        effort,
        waitingOn,
        waitingReminder,
        notBefore,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/** Create a task with optimistic insertion into all active task caches */
export function useCreateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        retry: (failureCount, error) => {
            if (error instanceof ApiErrorResponse && error.status === 429 && failureCount < 3) return true;
            return false;
        },
        mutationFn: withOfflineSupport<CreateTaskInput, Task>(
            (input) => ({
                type: "create_task",
                payload: { ...input, id: clientIdFor(input) },
            }),
            async (input) => {
                const id = clientIdFor(input);
                const res = await client.api.tasks.$post({
                    json: {
                        id,
                        title: input.title,
                        ...(input.content !== undefined && { content: input.content }),
                        orderIndex: input.orderIndex,
                        state: input.state ?? "ACTIVE",
                        ...(input.projectId && { projectId: input.projectId }),
                        ...(input.tagIds?.length ? { tagIds: input.tagIds } : {}),
                        ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
                        ...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
                        ...(input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
                        ...(input.dueDate && { dueDate: input.dueDate }),
                        ...(input.endDate && { endDate: input.endDate }),
                        ...(input.timezoneLocked !== undefined && { timezoneLocked: input.timezoneLocked }),
                        ...(input.priority !== undefined && { priority: input.priority }),
                        ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
                        ...(input.reminderAt && { reminderAt: input.reminderAt }),
                        ...(input.reminderSilenced !== undefined && { reminderSilenced: input.reminderSilenced }),
                        ...(input.recurrenceRule && { recurrenceRule: input.recurrenceRule }),
                        ...(input.interactionMode && { interactionMode: input.interactionMode }),
                        ...(input.waitingOn !== undefined && { waitingOn: input.waitingOn }),
                        ...(input.waitingReminder !== undefined && { waitingReminder: input.waitingReminder }),
                        ...(input.effort !== undefined && { effort: input.effort }),
                        ...(input.effortOrigin && { effortOrigin: input.effortOrigin }),
                        ...(input.notBefore !== undefined && { notBefore: input.notBefore }),
                        ...(input.durationEstimate !== undefined && { durationEstimate: input.durationEstimate }),
                        ...(input.nlp && { nlp: input.nlp }),
                    },
                }, {
                    headers: { "Idempotency-Key": id },
                });
                return unwrapResponse(res);
            },
        ),

        onMutate: async (input) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            // The optimistic row already has the id the server will keep.
            const optimisticTask = buildOptimisticTask(clientIdFor(input), input);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => [...items, optimisticTask], { initialize: true }),
            );


            return { snapshot, optimisticId: optimisticTask.id };
        },

        onSuccess: (task, input, context) => {
            if (!task) return; // Queued offline
            if (input.effortOrigin) void queryClient.invalidateQueries({ queryKey: queryKeys.effortEvidence });
            if (isRecurringTask(task)) {
                taskCache.invalidate(queryClient);
                return;
            }
            reconcileTaskInCaches(queryClient, task, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            taskCache.invalidate(queryClient);
            toastError(err, "Couldn't create task");
        },
    });
}
