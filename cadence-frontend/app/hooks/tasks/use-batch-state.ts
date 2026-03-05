import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { invalidateTaskCaches } from "./optimistic-helpers";
import type { Task, TaskState } from "../../types/task";
import { toast } from "sonner";

/** Batch-transition multiple tasks to a new state (COMPLETE, WAITING, ARCHIVED, ACTIVE) */
export function useBatchStateTransition() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            taskIds,
            state,
        }: {
            taskIds: string[];
            state: TaskState;
        }) => {
            const res = await client.api.tasks.batch.state.$patch({
                json: { taskIds, state },
            });
            return unwrapResponse<Task[]>(res);
        },
        onError: (err) => {
            toast.error(err.message || "Failed to update tasks");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}

export function useBatchRescheduleTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            taskIds,
            scheduledStart,
            isAllDay
        }: {
            taskIds: string[];
            scheduledStart: string;
            isAllDay: boolean;
        }) => {
            const res = await client.api.tasks.batch.reschedule.$post({
                json: { taskIds, scheduledStart, isAllDay },
            });
            return unwrapResponse<Task[]>(res);
        },
        onError: (err) => {
            toast.error(err.message || "Failed to reschedule tasks");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}

export function useBatchDeleteTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
            // Delete individually since no batch delete API
            const results = await Promise.all(taskIds.map(id =>
                client.api.tasks[":id"].$delete({ param: { id } })
            ));
            return results;
        },
        onError: (err) => {
            toast.error(err.message || "Failed to delete tasks");
        },
        onSettled: () => invalidateTaskCaches(queryClient),
    });
}
