import { keepPreviousData, useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { parseApiError, unwrapResponse } from "../../lib/api/helpers";
import type { Subtask } from "@cadence/contracts/subtask";
import { useAuthState } from "../auth/use-auth-state";
import { transformListCache } from "../../lib/api/cache-guards";
import { clientIdFor } from "../../lib/api/optimistic-id";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { chunk } from "../../lib/utils";
import { toastError } from "../../lib/utils/error-toast";
import { queryKeys } from "../../lib/api/query-keys";
import { useTaskDetailIntentStore } from "../../stores/task-detail-intent-store";

const SUBTASKS_KEY = (taskId: string) => ["tasks", taskId, "subtasks"] as const;
const BULK_SUBTASKS_KEY = (taskIds: string[]) => ["subtasks", "bulk", taskIds] as const;

type BulkSubtasksMap = Record<string, Subtask[]>;
type CachedSubtask = Subtask & { __optimisticKey?: string };

function sortSubtasks(items: CachedSubtask[]) {
    return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

function normalizeBulkSubtasksMap(taskIds: string[], data: BulkSubtasksMap) {
    return Object.fromEntries(
        taskIds.map((taskId) => [taskId, sortSubtasks(data[taskId] ?? [])]),
    ) as BulkSubtasksMap;
}

function replaceSubtask(items: CachedSubtask[], nextSubtask: Subtask, optimisticId?: string) {
    const didMatchById = items.some((item) => item.id === nextSubtask.id);
    if (didMatchById) {
        return sortSubtasks(items.map((item) => (item.id === nextSubtask.id ? nextSubtask : item)));
    }

    if (optimisticId) {
        const optimisticMatch = items.find((item) => item.id === optimisticId);
        if (optimisticMatch) {
            return sortSubtasks(
                items.map((item) =>
                    item.id === optimisticId
                        ? { ...nextSubtask, __optimisticKey: optimisticMatch.__optimisticKey ?? optimisticId }
                        : item,
                ),
            );
        }
    }

    return sortSubtasks([...items, nextSubtask]);
}

function updateBulkSubtasksCaches(
    queryClient: QueryClient,
    taskId: string,
    updater: (current: Subtask[]) => Subtask[],
) {
    queryClient.setQueriesData<Record<string, CachedSubtask[]>>({ queryKey: ["subtasks", "bulk"] }, (old) => {
        if (!old || !(taskId in old)) return old;
        return {
            ...old,
            [taskId]: sortSubtasks(updater(old[taskId] ?? [])),
        };
    });
}

function reconcileSingleSubtaskCache(
    queryClient: QueryClient,
    taskId: string,
    nextSubtask: Subtask,
    optimisticId?: string,
) {
    queryClient.setQueryData<CachedSubtask[]>(SUBTASKS_KEY(taskId), (old) =>
        replaceSubtask(Array.isArray(old) ? old : [], nextSubtask, optimisticId),
    );
    updateBulkSubtasksCaches(queryClient, taskId, (old) => replaceSubtask(old, nextSubtask, optimisticId));
}

export function useSubtasks(taskId: string) {
    const api = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: SUBTASKS_KEY(taskId),
        queryFn: async () => {
            const res = await api.api.tasks[":taskId"].subtasks.$get({
                param: { taskId },
            });
            return unwrapResponse(res);
        },
        enabled: !!taskId && authReady && isAuthenticated,
    });
}

export function useSubtasksByTaskIds(taskIds: string[]) {
    const api = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const uniqueTaskIds = [...new Set(taskIds)].filter(Boolean).sort();

    return useQuery({
        queryKey: BULK_SUBTASKS_KEY(uniqueTaskIds),
        enabled: uniqueTaskIds.length > 0 && authReady && isAuthenticated,
        // Keep showing the last map while a changed list loads, so rows don't flicker.
        placeholderData: keepPreviousData,
        queryFn: async () => {
            // The route takes 200 ids per call (about 7.5KB of URL).
            const maps = await Promise.all(chunk(uniqueTaskIds, 200).map(async (ids) =>
                unwrapResponse(await api.api.subtasks.$get({ query: { taskIds: ids.join(",") } }))));
            return normalizeBulkSubtasksMap(uniqueTaskIds, Object.assign({}, ...maps));
        },
    });
}

/** `onMutate` for a subtask change: stop in-flight reads, remember the list, and show `edit` in the task's list and the bulk lists. */
async function beginEdit(queryClient: QueryClient, taskId: string, edit: (items: CachedSubtask[]) => CachedSubtask[], initialize = false) {
    await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
    const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));
    queryClient.setQueryData<CachedSubtask[]>(SUBTASKS_KEY(taskId), (old) => transformListCache(old, edit, { initialize }));
    updateBulkSubtasksCaches(queryClient, taskId, edit);
    return { previous };
}

function revertEdit(queryClient: QueryClient, taskId: string, context: { previous?: Subtask[] } | undefined) {
    if (!context?.previous) return;
    queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
    updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
}

function settleEdit(queryClient: QueryClient, taskId: string, data: unknown, error: unknown) {
    if (wasQueued(data, error)) return;
    queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId), exact: true });
}

/** A `beginEdit` mutation's ends: put the list back on failure, then refetch unless it was queued offline. */
const editEnds = (queryClient: QueryClient, taskId: string) => ({
    onError: (_err: unknown, _vars: unknown, context: { previous?: Subtask[] } | undefined) => revertEdit(queryClient, taskId, context),
    onSettled: (data: unknown, error: unknown) => settleEdit(queryClient, taskId, data, error),
});

export function useCreateSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<{ title: string; orderIndex: number }, Subtask>(
            (input) => ({ type: "create_subtask", taskId, payload: { id: clientIdFor(input), title: input.title, orderIndex: input.orderIndex } }),
            async (input) => {
                const id = clientIdFor(input);
                const res = await api.api.tasks[":taskId"].subtasks.$post(
                    { param: { taskId }, json: { id, title: input.title, orderIndex: input.orderIndex } },
                    { headers: { "Idempotency-Key": id } },
                );
                return unwrapResponse(res);
            },
        ),
        onMutate: async (newSubtask) => {
            // The first step written after "Break into steps?" is the answer the server records. Quiet if it can't.
            if (useTaskDetailIntentStore.getState().stepWritten(taskId)) {
                void api.api.ai.memory.planning.offer.$post({ json: { taskId, kind: "steps", outcome: "chosen" } }).catch(() => undefined);
                void queryClient.invalidateQueries({ queryKey: queryKeys.ai.planningOffers });
            }
            const optimistic: CachedSubtask = {
                id: clientIdFor(newSubtask),
                taskId,
                title: newSubtask.title,
                isComplete: false,
                orderIndex: newSubtask.orderIndex,
                createdAt: new Date().toISOString(),
                __optimisticKey: `optimistic-${Date.now()}`,
            };
            const { previous } = await beginEdit(queryClient, taskId, (items) => sortSubtasks([...items, optimistic]), true);
            return { previous, optimisticId: optimistic.id };
        },
        onSuccess: (created, _newSubtask, context) => {
            if (created) reconcileSingleSubtaskCache(queryClient, taskId, created, context?.optimisticId);
        },
        onError: (err, _vars, context) => {
            revertEdit(queryClient, taskId, context);
            // The task was deleted elsewhere: it's gone from the screen too, so there is nothing to explain.
            if ((err as { status?: number }).status !== 404) toastError(err, "Couldn't add subtask");
        },
        onSettled: (data, error) => settleEdit(queryClient, taskId, data, error),
    });
}

export function useUpdateSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<{ id: string; title?: string; isComplete?: boolean }, Subtask>(
            ({ id, ...payload }) => ({ type: "update_subtask", id, payload }),
            async ({ id, ...updates }) => unwrapResponse(await api.api.subtasks[":id"].$patch({ param: { id }, json: updates })),
        ),
        onMutate: (variables) =>
            beginEdit(queryClient, taskId, (items) => items.map((st) => (st.id === variables.id ? { ...st, ...variables } : st))),
        onSuccess: (updated) => {
            if (updated) reconcileSingleSubtaskCache(queryClient, taskId, updated);
        },
        ...editEnds(queryClient, taskId),
    });
}

export function useDeleteSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<string, true>(
            (id) => ({ type: "delete_subtask", id }),
            async (id) => {
                const res = await api.api.subtasks[":id"].$delete({ param: { id } });
                if (!res.ok && res.status !== 404) throw await parseApiError(res);
                return true;
            },
        ),
        onMutate: (id) => beginEdit(queryClient, taskId, (items) => items.filter((st) => st.id !== id)),
        ...editEnds(queryClient, taskId),
    });
}

export function useReorderSubtasks(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: withOfflineSupport<{ id: string; newOrderIndex: number; optimisticSubtasks?: Subtask[] }, Subtask>(
            ({ id, newOrderIndex }) => ({ type: "reorder_subtask", id, payload: { orderIndex: newOrderIndex } }),
            async ({ id, newOrderIndex }) =>
                unwrapResponse(await api.api.subtasks[":id"].reorder.$patch({ param: { id }, json: { orderIndex: newOrderIndex } })),
        ),
        onMutate: (variables) =>
            beginEdit(
                queryClient,
                taskId,
                variables.optimisticSubtasks
                    ? () => variables.optimisticSubtasks ?? []
                    : (items) => items.map((st) => (st.id === variables.id ? { ...st, orderIndex: variables.newOrderIndex } : st)).sort((a, b) => a.orderIndex - b.orderIndex),
                Boolean(variables.optimisticSubtasks),
            ),
        onSuccess: (updated) => {
            if (updated) reconcileSingleSubtaskCache(queryClient, taskId, updated);
        },
        ...editEnds(queryClient, taskId),
    });
}
