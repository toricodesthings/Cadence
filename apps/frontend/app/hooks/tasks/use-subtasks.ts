import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { Subtask } from "../../types/task";
import { useAuthState } from "../auth/use-auth-state";
import { transformListCache } from "../../lib/api/cache-guards";
import { toast } from "sonner";
import { ApiErrorResponse } from "../../types/api";
import { showRateLimitToast } from "../../lib/utils/rate-limit-toast";

const SUBTASKS_KEY = (taskId: string) => ["tasks", taskId, "subtasks"] as const;
const BULK_SUBTASKS_KEY = (taskIds: string[]) => ["subtasks", "bulk", taskIds] as const;

type BulkSubtasksMap = Record<string, Subtask[]>;
type CachedSubtask = Subtask & { __optimisticKey?: string };

const createSubtaskIdempotencyKeys = new WeakMap<{ title: string; orderIndex: number }, string>();

function getCreateSubtaskIdempotencyKey(input: { title: string; orderIndex: number }) {
    const existingKey = createSubtaskIdempotencyKeys.get(input);
    if (existingKey) return existingKey;

    const nextKey = crypto.randomUUID();
    createSubtaskIdempotencyKeys.set(input, nextKey);
    return nextKey;
}

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
            const res = await (api.api.tasks as any)[":taskId"].subtasks.$get({
                param: { taskId },
            });
            return unwrapResponse<Subtask[]>(res);
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
        queryFn: async () => {
            const res = await (api.api.subtasks as any).bulk.$post({
                json: { taskIds: uniqueTaskIds },
            });
            const data = await unwrapResponse<BulkSubtasksMap>(res);
            return normalizeBulkSubtasksMap(uniqueTaskIds, data);
        },
    });
}

export function useCreateSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { title: string; orderIndex: number }) => {
            const idempotencyKey = getCreateSubtaskIdempotencyKey(input);
            const res = await (api.api.tasks as any)[":taskId"].subtasks.$post({
                param: { taskId },
                header: { "Idempotency-Key": idempotencyKey },
                json: { title: input.title, orderIndex: input.orderIndex },
            });
            return unwrapResponse<Subtask>(res);
        },
        onMutate: async (newSubtask) => {
            await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
            const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));

            const optimistic: CachedSubtask = {
                id: `temp-${Date.now()}`,
                taskId,
                title: newSubtask.title,
                isComplete: false,
                orderIndex: newSubtask.orderIndex,
                createdAt: new Date().toISOString(),
                __optimisticKey: `optimistic-${Date.now()}`,
            };

            queryClient.setQueryData<CachedSubtask[]>(SUBTASKS_KEY(taskId), (old) => {
                const list = [...(Array.isArray(old) ? old : []), optimistic];
                return sortSubtasks(list);
            });
            updateBulkSubtasksCaches(queryClient, taskId, (old) => [...old, optimistic]);

            return { previous, optimisticId: optimistic.id };
        },
        onSuccess: (created, _newSubtask, context) => {
            reconcileSingleSubtaskCache(queryClient, taskId, created, context?.optimisticId);
        },
        onError: (err, _new, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }

            if (err instanceof ApiErrorResponse && err.status === 429) {
                showRateLimitToast();
                return;
            }

            toast.error(err.message || "Failed to add subtask");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId), exact: true });
        },
    });
}

export function useUpdateSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...updates }: { id: string; title?: string; isComplete?: boolean }) => {
            const res = await (api.api.subtasks as any)[":id"].$patch({
                param: { id },
                json: updates,
            });
            return unwrapResponse<Subtask>(res);
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
            const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));

            queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY(taskId), (old) => {
                return transformListCache(old, (items) =>
                    items.map((st) => (st.id === variables.id ? { ...st, ...variables } : st)),
                );
            });
            updateBulkSubtasksCaches(queryClient, taskId, (old) =>
                old.map((st) => (st.id === variables.id ? { ...st, ...variables } : st)),
            );

            return { previous };
        },
        onSuccess: (updated) => {
            reconcileSingleSubtaskCache(queryClient, taskId, updated);
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId), exact: true });
        },
    });
}

export function useDeleteSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await (api.api.subtasks as any)[":id"].$delete({
                param: { id },
            });
            if (!res.ok) throw new Error("Failed to delete subtask");
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
            const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));

            queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY(taskId), (old) => {
                return transformListCache(old, (items) => items.filter((st) => st.id !== id));
            });
            updateBulkSubtasksCaches(queryClient, taskId, (old) => old.filter((st) => st.id !== id));

            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId), exact: true });
        },
    });
}

export function useReorderSubtasks(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, newOrderIndex }: { id: string; newOrderIndex: number; optimisticSubtasks?: Subtask[] }) => {
            const res = await (api.api.subtasks as any)[":id"].reorder.$patch({
                param: { id },
                json: { orderIndex: newOrderIndex },
            });
            return unwrapResponse<Subtask>(res);
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
            const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));

            if (variables.optimisticSubtasks) {
                queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY(taskId), variables.optimisticSubtasks);
                updateBulkSubtasksCaches(queryClient, taskId, () => variables.optimisticSubtasks ?? []);
            } else {
                queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY(taskId), (old) => {
                    return transformListCache(old, (items) =>
                        items
                            .map((st) => (st.id === variables.id ? { ...st, orderIndex: variables.newOrderIndex } : st))
                            .sort((a, b) => a.orderIndex - b.orderIndex),
                    );
                });
                updateBulkSubtasksCaches(queryClient, taskId, (old) =>
                    old
                        .map((st) => (st.id === variables.id ? { ...st, orderIndex: variables.newOrderIndex } : st))
                        .sort((a, b) => a.orderIndex - b.orderIndex),
                );
            }

            return { previous };
        },
        onSuccess: (updated) => {
            reconcileSingleSubtaskCache(queryClient, taskId, updated);
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId), exact: true });
        },
    });
}
