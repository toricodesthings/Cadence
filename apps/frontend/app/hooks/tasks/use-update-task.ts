import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { taskCache } from "./optimistic-helpers";
import type { Task, UpdateTaskInput } from "@cadence/contracts/task";
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

/**
 * Writes to one task run in order, and each sends the version the previous one
 * returned. Without this, a quick Undo races its own change and reads a stale
 * `updatedAt` from the cache, which the server rejects as a conflict.
 */
const lastWriteById = new Map<string, Promise<Task | undefined>>();

function afterPreviousWrite(id: string, write: (freshUpdatedAt: string | undefined) => Promise<Task>) {
    const previous = lastWriteById.get(id) ?? Promise.resolve(undefined);
    const next = previous.catch(() => undefined).then((last) => write(last?.updatedAt));
    lastWriteById.set(id, next);
    void next.catch(() => undefined).finally(() => {
        if (lastWriteById.get(id) === next) lastWriteById.delete(id);
    });
    return next;
}

/** Update any task field with optimistic patching across all caches */
export function useUpdateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    /** The newest version any cache holds: an inactive list (another range, a restored cache) can lag behind. */
    function getExpectedUpdatedAt(id: string): string | undefined {
        let latest: string | undefined;
        for (const [, tasks] of queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all })) {
            if (!Array.isArray(tasks)) continue;
            const task = tasks.find((item) => item.id === id);
            if (task?.updatedAt && (!latest || Date.parse(task.updatedAt) > Date.parse(latest))) latest = task.updatedAt;
        }
        return latest;
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
            ({ id, ...raw }) => afterPreviousWrite(id, async (freshUpdatedAt) => {
                const updates = normalizeDateRange(raw);
                const res = await client.api.tasks[":id"].$patch({
                    param: { id },
                    json: {
                        ...updates,
                        ...(updates.expectedUpdatedAt ? {} : { expectedUpdatedAt: freshUpdatedAt ?? getExpectedUpdatedAt(id) }),
                    },
                });
                return unwrapResponse(res);
            }),
        ),

        onMutate: async ({ id, ...raw }) => {
            const updates = normalizeDateRange(raw);
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            queryClient.setQueriesData<Task[]>(
                { queryKey: queryKeys.tasks.all },
                (old) => transformListCache(old, (items) => items.map((t) => (t.id === id ? { ...t, ...updates } : t))),
            );

            return { snapshot };
        },

        onSuccess: (task) => {
            if (!task) return; // Queued offline
            if (isRecurringTask(task)) {
                taskCache.invalidate(queryClient);
                return;
            }
            reconcileTaskInCaches(queryClient, task);
        },

        onError: (err, _input, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            const message = err instanceof Error ? err.message : "Failed to update task";
            if (/conflict|modified|stale/i.test(message)) {
                toast.error("Task changed elsewhere. Reloading the latest version.");
            } else {
                toast.error(message || "Failed to update task");
            }
            taskCache.invalidate(queryClient);
        },
    });
}
