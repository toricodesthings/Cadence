import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { taskCache } from "./optimistic-helpers";
import type { Task, UpdateTaskInput } from "@cadence/contracts/task";
import { reconcileTaskInCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { isRecurringTask } from "../../lib/utils/task/task-scheduling";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { offerDuration } from "../../lib/ai/duration-prompt";
import { useDurationApi } from "../ai/use-memory";
import { useDurationGuesser } from "../ai/use-duration-guess";
import { useSettings } from "../core/use-settings";
import { tagIdsAfterMove } from "../../lib/utils/task/place-tags";

function normalizeDateRange<T extends Record<string, unknown>>(updates: T): T {
    const { scheduledStart, scheduledEnd } = updates as { scheduledStart?: string; scheduledEnd?: string };
    if (scheduledStart && scheduledEnd && scheduledStart > scheduledEnd) {
        return { ...updates, scheduledStart: scheduledEnd, scheduledEnd: scheduledStart };
    }
    return updates;
}

const lastWriteById = new Map<string, Promise<Task | undefined>>();

function afterPreviousWrite(id: string, write: (freshUpdatedAt: string | undefined) => Promise<Task>) {
    const previous = lastWriteById.get(id) ?? Promise.resolve(undefined);
    const next = previous.catch(() => undefined).then((last) => write(last?.updatedAt));
    lastWriteById.set(id, next);
    void next
        .catch(() => undefined)
        .finally(() => {
            if (lastWriteById.get(id) === next) lastWriteById.delete(id);
        });
    return next;
}

export function useUpdateTask() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { data: settings } = useSettings();
    const durationApi = useDurationApi();
    const guessOf = useDurationGuesser();

    function getExpectedUpdatedAt(id: string): string | undefined {
        let latest: string | undefined;
        for (const [key, tasks] of queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all })) {
            if (typeof key[1] !== "object" || !Array.isArray(tasks)) continue;
            const task = tasks.find((item) => item.id === id);
            if (task?.updatedAt && (!latest || Date.parse(task.updatedAt) > Date.parse(latest)))
                latest = task.updatedAt;
        }
        return latest;
    }

    return useMutation({
        mutationFn: withOfflineSupport<{ id: string } & UpdateTaskInput, Task>(
            ({ id, ...raw }) => ({ type: "update_task", id, payload: normalizeDateRange(raw) }),
            ({ id, ...raw }) =>
                afterPreviousWrite(id, async (freshUpdatedAt) => {
                    const updates = normalizeDateRange(raw);
                    const res = await client.api.tasks[":id"].$patch({
                        param: { id },
                        json: {
                            ...updates,
                            ...(updates.expectedUpdatedAt
                                ? {}
                                : { expectedUpdatedAt: freshUpdatedAt ?? getExpectedUpdatedAt(id) }),
                        },
                    });
                    return unwrapResponse(res);
                }),
        ),

        onMutate: async ({ id, ...raw }) => {
            const { findTime: _findTime, ...fields } = raw;
            const updates = normalizeDateRange(fields);
            const autoTag = settings?.tasks?.autoTag !== false;
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);

            queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.all }, (old) =>
                transformListCache(old, (items) =>
                    items.map((t) => {
                        if (t.id === id) {
                            const tagIds =
                                autoTag && ("projectId" in updates || "sectionId" in updates)
                                    ? tagIdsAfterMove(queryClient, t, updates)
                                    : t.tagIds;
                            return { ...t, tagIds, ...updates };
                        }
                        if (t.seriesId === id && ("linkedAppId" in updates || "linkedUrl" in updates)) {
                            return {
                                ...t,
                                ...("linkedAppId" in updates && { linkedAppId: updates.linkedAppId }),
                                ...("linkedUrl" in updates && { linkedUrl: updates.linkedUrl }),
                            };
                        }
                        return t;
                    }),
                ),
            );

            return { snapshot };
        },

        onSuccess: (task, input) => {
            if (!task) return;
            if (input.state === "COMPLETE")
                void offerDuration(task, settings?.assistant?.memoryMode, durationApi, guessOf(task)?.minutes ?? null);
            if (input.effort !== undefined) void queryClient.invalidateQueries({ queryKey: queryKeys.effortEvidence });
            if (isRecurringTask(task)) {
                taskCache.invalidate(queryClient);
                return;
            }
            reconcileTaskInCaches(queryClient, task);
        },

        onError: (err, input, context) => {
            if (input.findTime && !input.findTime.undo && (err as { status?: number } | null)?.status === 409) {
                if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
                taskCache.invalidate(queryClient);
                return;
            }
            taskCache.fail(queryClient, err, context, "Couldn't update task");
        },
    });
}
