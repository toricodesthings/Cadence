import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { taskCache } from "./optimistic-helpers";
import type { Task, TaskState } from "@cadence/contracts/task";
import { reconcileTaskInCaches, removeTaskFromCaches } from "../../lib/api/cache-sync";
import { transformListCache } from "../../lib/api/cache-guards";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { chunk } from "../../lib/utils";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, toastUndo, undoWindow } from "../../lib/utils/undo-toast";
import { rescheduleToDay } from "@cadence/domain/task-temporal";
import type { Instant, LocalDate } from "@cadence/domain/time";
import { getUserZone } from "../../lib/utils/user-zone";

/** The batch routes take at most 50 ids, so larger selections go as several calls. */
async function inBatches<T>(taskIds: string[], send: (ids: string[]) => Promise<T[]>): Promise<T[]> {
    return (await Promise.all(chunk(taskIds, 50).map(send))).flat();
}

/** Batch-transition multiple tasks to a new state (COMPLETE, WAITING, ARCHIVED, ACTIVE) */
export function useBatchStateTransition() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<
            { taskIds: string[]; state: TaskState },
            Task[]
        >(
            ({ taskIds, state }) => ({ type: "batch_state", payload: { taskIds, state } }),
            ({ taskIds, state }) => inBatches(taskIds, async (ids) =>
                unwrapResponse(await client.api.tasks.batch.state.$patch({ json: { taskIds: ids, state } }))),
        ),
        onMutate: async ({ taskIds, state }) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) =>
                    items.map((task) => (taskIds.includes(task.id) ? { ...task, state } : task)),
                ),
            );
            return { snapshot };
        },
        onSuccess: (tasks) => {
            if (!tasks) return; // Queued offline
            tasks.forEach((task) => reconcileTaskInCaches(queryClient, task));
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't update tasks");
            taskCache.invalidate(queryClient);
        },
    });
}

/** A day (each task keeps its own local time there) or one exact start instant for all. */
export type BatchRescheduleInput = { taskIds: string[] } & ({ date: LocalDate } | { scheduledStart: Instant });

export function useBatchRescheduleTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<BatchRescheduleInput, Task[]>(
            (input) => ({ type: "batch_reschedule", payload: input }),
            ({ taskIds, ...when }) => inBatches(taskIds, async (ids) =>
                unwrapResponse(await client.api.tasks.batch.reschedule.$post({ json: { taskIds: ids, ...when } }))),
        ),
        onMutate: async (input) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
            const zone = getUserZone();
            const moved = (task: Task): Task =>
                "date" in input
                    ? { ...task, ...rescheduleToDay(task, input.date, zone) }
                    : { ...task, scheduledStart: input.scheduledStart, zone, endDate: null };
            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) =>
                    items.map((task) => (input.taskIds.includes(task.id) ? moved(task) : task)),
                ),
            );
            return { snapshot };
        },
        onSuccess: (tasks) => {
            if (!tasks) return; // Queued offline
            tasks.forEach((task) => reconcileTaskInCaches(queryClient, task));
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't reschedule tasks");
            taskCache.invalidate(queryClient);
        },
    });
}

const countLabel = (n: number) => `${n} task${n === 1 ? "" : "s"}`;

/** Permanently deletes tasks, but only once Undo's window closes; they leave the screen at once. */
export function useBatchDeleteTasks() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const send = withOfflineSupport<{ taskIds: string[] }, Task[]>(
        ({ taskIds }) => ({ type: "batch_delete", payload: { taskIds } }),
        ({ taskIds }) => inBatches(taskIds, async (ids) =>
            unwrapResponse(await client.api.tasks.batch.delete.$post({ json: { taskIds: ids } }))),
    );

    return useMutation({
        mutationFn: async (input: { taskIds: string[] }) => {
            await undoWindow(`Deleted ${countLabel(input.taskIds.length)}`, { description: "They're gone for good once this closes." });
            return send(input);
        },
        onMutate: async ({ taskIds }) => {
            await taskCache.cancel(queryClient);
            const snapshot = taskCache.snapshot(queryClient);
            queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
                transformListCache(old, (items) =>
                    items.filter((task) => !taskIds.includes(task.id)),
                ),
            );
            return { snapshot };
        },
        onSuccess: (_results, { taskIds }) => {
            taskIds.forEach((taskId) => removeTaskFromCaches(queryClient, taskId));
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) taskCache.rollback(queryClient, context.snapshot);
            if (!isUndone(err)) toastError(err, "Couldn't delete tasks");
            taskCache.invalidate(queryClient);
        },
    });
}

/** The state each task is in now, read before a change so Undo can put it back. */
function statesOf(queryClient: ReturnType<typeof useQueryClient>, taskIds: string[]) {
    const wanted = new Set(taskIds);
    const states = new Map<string, TaskState>();
    for (const [, list] of taskCache.snapshot(queryClient)) {
        if (!Array.isArray(list)) continue;
        for (const task of list as Task[]) if (wanted.has(task.id)) states.set(task.id, task.state);
    }
    return states;
}

/**
 * Sends tasks to Trash with one Undo toast that returns each to the state it came from.
 * The one place bulk Trash is wired, so the bar and the keyboard shortcut behave alike.
 */
export function useTrashTasks() {
    const queryClient = useQueryClient();
    const { mutate } = useBatchStateTransition();

    return useCallback((taskIds: string[], onDone?: () => void) => {
        if (taskIds.length === 0) return;
        const before = statesOf(queryClient, taskIds);
        mutate({ taskIds, state: "ARCHIVED" }, {
            onSuccess: () => {
                onDone?.();
                toastUndo(`Moved ${countLabel(taskIds.length)} to Trash`, () => {
                    const byState = new Map<TaskState, string[]>();
                    for (const id of taskIds) {
                        const state = before.get(id) ?? "ACTIVE";
                        byState.set(state, [...(byState.get(state) ?? []), id]);
                    }
                    for (const [state, ids] of byState) mutate({ taskIds: ids, state });
                });
            },
        });
    }, [queryClient, mutate]);
}
