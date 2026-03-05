import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
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

/** Create a task with optimistic insertion into all active task caches */
export function useCreateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateTaskInput) => {
            const res = await client.api.tasks.$post({
                json: {
                    title: input.title,
                    orderIndex: input.orderIndex,
                    state: "ACTIVE",
                    isAllDay: input.isAllDay ?? true,
                    ...(input.projectId && { projectId: input.projectId }),
                    ...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
                    ...(input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
                    ...(input.dueDate && { dueDate: input.dueDate }),
                    ...(input.priority !== undefined && { priority: input.priority }),
                    ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
                    ...(input.reminderAt && { reminderAt: input.reminderAt }),
                    ...(input.reminderSilenced !== undefined && { reminderSilenced: input.reminderSilenced }),
                    ...(input.recurrenceRule && { recurrenceRule: input.recurrenceRule }),
                },
            });
            return unwrapResponse<Task>(res);
        },

        onMutate: async (input) => {
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);

            // Build an optimistic task with a temporary ID
            const optimisticTask: Task = {
                id: crypto.randomUUID(),
                userId: "",
                projectId: input.projectId ?? null,
                title: input.title,
                content: null,
                state: "ACTIVE",
                orderIndex: input.orderIndex,
                isAllDay: input.isAllDay ?? true,
                dueDate: input.dueDate ?? null,
                scheduledStart: input.scheduledStart ?? null,
                scheduledEnd: input.scheduledEnd ?? null,
                durationEstimate: null,
                timezoneLocked: false,
                priority: input.priority ?? 0,
                isPinned: input.isPinned ?? false,
                reminderAt: input.reminderAt ?? null,
                reminderSilenced: input.reminderSilenced ?? false,
                recurrenceRule: input.recurrenceRule ?? null,
                effort: input.effort ?? null,
                waitingOn: input.waitingOn ?? null,
                waitingReminder: input.waitingReminder ?? null,
                notBefore: input.notBefore ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => (old ? [...old, optimisticTask] : [optimisticTask]),
            );


            return { snapshot };
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            toast.error(err.message || "Failed to create task");
        },

        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
