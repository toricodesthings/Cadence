import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    snapshotTaskCache,
    rollbackTaskCache,
    invalidateTaskCaches,
    cancelTaskQueries,
} from "./optimistic-helpers";
import type { Task, CreateTaskInput } from "../../types/task";
import { toast } from "sonner";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { isRecurringTask } from "../../lib/utils/task-scheduling";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/** Create a task with optimistic insertion into all active task caches */
export function useCreateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<CreateTaskInput, Task>(
            (input) => ({
                type: "create_task",
                payload: {
                    ...input,
                    clientMutationId: crypto.randomUUID(),
                },
            }),
            async (input) => {
                const res = await client.api.tasks.$post({
                    json: {
                        title: input.title,
                        ...(input.content !== undefined && { content: input.content }),
                        orderIndex: input.orderIndex,
                        state: "ACTIVE",
                        isAllDay: input.isAllDay ?? true,
                        ...(input.projectId && { projectId: input.projectId }),
                        ...(input.sectionId !== undefined && { sectionId: input.sectionId }),
                        ...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
                        ...(input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
                        ...(input.dueDate && { dueDate: input.dueDate }),
                        ...(input.timezoneLocked !== undefined && { timezoneLocked: input.timezoneLocked }),
                        ...(input.priority !== undefined && { priority: input.priority }),
                        ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
                        ...(input.reminderAt && { reminderAt: input.reminderAt }),
                        ...(input.reminderSilenced !== undefined && { reminderSilenced: input.reminderSilenced }),
                        ...(input.recurrenceRule && { recurrenceRule: input.recurrenceRule }),
                        ...(input.interactionMode && { interactionMode: input.interactionMode }),
                    },
                });
                return unwrapResponse<Task>(res);
            },
        ),

        onMutate: async (input) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);

            // Build an optimistic task with a temporary ID
            const optimisticTask: Task = {
                id: crypto.randomUUID(),
                userId: "",
                projectId: input.projectId ?? null,
                sectionId: input.sectionId ?? null,
                tagIds: [],
                title: input.title,
                content: input.content ?? null,
                state: "ACTIVE",
                orderIndex: input.orderIndex,
                isAllDay: input.isAllDay ?? true,
                dueDate: input.dueDate ?? null,
                scheduledStart: input.scheduledStart ?? null,
                scheduledEnd: input.scheduledEnd ?? null,
                durationEstimate: null,
                timezoneLocked: input.timezoneLocked ?? false,
                priority: input.priority ?? 0,
                isPinned: input.isPinned ?? false,
                reminderAt: input.reminderAt ?? null,
                reminderSilenced: input.reminderSilenced ?? false,
                recurrenceRule: input.recurrenceRule ?? null,
                interactionMode: input.interactionMode ?? "task",
                effort: input.effort ?? null,
                waitingOn: input.waitingOn ?? null,
                waitingReminder: input.waitingReminder ?? null,
                notBefore: input.notBefore ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => [...items, optimisticTask], { initialize: true }),
            );


            return { snapshot, optimisticId: optimisticTask.id };
        },

        onSuccess: (task, _input, context) => {
            if (!task) return; // Queued offline
            if (isRecurringTask(task)) {
                invalidateTaskCaches(queryClient);
                return;
            }
            reconcileTaskInCaches(queryClient, task, context?.optimisticId);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            invalidateTaskCaches(queryClient);
            toast.error(err.message || "Failed to create task");
        },
    });
}
