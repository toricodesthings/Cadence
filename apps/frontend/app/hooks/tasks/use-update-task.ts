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
import type { Task, UpdateTaskInput } from "../../types/task";
import { toast } from "sonner";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { isRecurringTask } from "../../lib/utils/task/task-scheduling";
import { withOfflineSupport } from "../../lib/api/offline-mutation";

/** Normalize date ranges so scheduledStart ≤ scheduledEnd */
function normalizeDateRange<T extends Record<string, unknown>>(updates: T): T {
    const { scheduledStart, scheduledEnd } = updates as { scheduledStart?: string; scheduledEnd?: string };
    if (scheduledStart && scheduledEnd && scheduledStart > scheduledEnd) {
        return { ...updates, scheduledStart: scheduledEnd, scheduledEnd: scheduledStart };
    }
    return updates;
}

/** Update any task field with optimistic patching across all caches */
export function useUpdateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    function getExpectedUpdatedAt(id: string): string | undefined {
        const cached = queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all });
        for (const [, tasks] of cached) {
            if (!Array.isArray(tasks)) continue;
            const task = tasks.find((item) => item.id === id);
            if (task) return task.updatedAt;
        }
        return undefined;
    }

    return useMutation({
        mutationFn: withOfflineSupport<{ id: string } & UpdateTaskInput, Task>(
            ({ id, ...raw }) => {
                const updates = normalizeDateRange(raw);
                return {
                    type: "update_task",
                    id,
                    payload: {
                        ...updates,
                        ...(updates.expectedUpdatedAt ? {} : { expectedUpdatedAt: getExpectedUpdatedAt(id) }),
                    },
                };
            },
            async ({ id, ...raw }) => {
                const updates = normalizeDateRange(raw);
                const res = await client.api.tasks[":id"].$patch({
                    param: { id },
                    json: {
                        ...updates,
                        ...(updates.expectedUpdatedAt ? {} : { expectedUpdatedAt: getExpectedUpdatedAt(id) }),
                    },
                });
                return unwrapResponse<Task>(res);
            },
        ),

        onMutate: async ({ id, ...raw }) => {
            const updates = normalizeDateRange(raw);
            await cancelTaskQueries(queryClient);
            const snapshot = snapshotTaskCache(queryClient);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.map((t) => (t.id === id ? { ...t, ...updates } : t))),
            );

            return { snapshot };
        },

        onSuccess: (task) => {
            if (!task) return; // Queued offline
            if (isRecurringTask(task)) {
                invalidateTaskCaches(queryClient);
                return;
            }
            reconcileTaskInCaches(queryClient, task);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
            const message = err instanceof Error ? err.message : "Failed to update task";
            if (/conflict|modified|stale/i.test(message)) {
                toast.error("Task changed elsewhere. Reloading the latest version.");
            } else {
                toast.error(message || "Failed to update task");
            }
            invalidateTaskCaches(queryClient);
        },
    });
}
