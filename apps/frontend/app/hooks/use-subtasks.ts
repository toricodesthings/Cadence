import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./use-api-client";
import { unwrapResponse } from "../lib/api/helpers";
import type { Subtask } from "../types/task";
import { useAuthState } from "./use-auth-state";
import { transformListCache } from "../lib/api/cache-guards";

const SUBTASKS_KEY = (taskId: string) => ["tasks", taskId, "subtasks"] as const;
const BULK_SUBTASKS_KEY = (taskIds: string[]) => ["subtasks", "bulk", taskIds] as const;

type BulkSubtasksMap = Record<string, Subtask[]>;

function updateBulkSubtasksCaches(
    queryClient: ReturnType<typeof useQueryClient>,
    taskId: string,
    updater: (current: Subtask[]) => Subtask[],
) {
    queryClient.setQueriesData<BulkSubtasksMap>({ queryKey: ["subtasks", "bulk"] }, (old) => {
        if (!old || !(taskId in old)) return old;
        return {
            ...old,
            [taskId]: updater(old[taskId] ?? []),
        };
    });
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
            const subtasksByTaskId = await Promise.all(
                uniqueTaskIds.map(async (taskId) => {
                    const res = await (api.api.tasks as any)[":taskId"].subtasks.$get({
                        param: { taskId },
                    });
                    return [taskId, await unwrapResponse<Subtask[]>(res)] as const;
                }),
            );

            return Object.fromEntries(subtasksByTaskId) as BulkSubtasksMap;
        },
    });
}

export function useCreateSubtask(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ title, orderIndex }: { title: string; orderIndex: number }) => {
            const res = await (api.api.tasks as any)[":taskId"].subtasks.$post({
                param: { taskId },
                json: { title, orderIndex },
            });
            return unwrapResponse<Subtask>(res);
        },
        onMutate: async (newSubtask) => {
            await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
            const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));

            const optimistic: Subtask = {
                id: `temp-${Date.now()}`,
                taskId,
                title: newSubtask.title,
                isComplete: false,
                orderIndex: newSubtask.orderIndex,
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY(taskId), (old) => {
                const list = [...(Array.isArray(old) ? old : []), optimistic];
                return list.sort((a, b) => a.orderIndex - b.orderIndex);
            });
            updateBulkSubtasksCaches(queryClient, taskId, (old) => {
                const list = [...old, optimistic];
                return list.sort((a, b) => a.orderIndex - b.orderIndex);
            });

            return { previous };
        },
        onError: (_err, _new, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
            queryClient.invalidateQueries({ queryKey: ["subtasks", "bulk"] });
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
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
            queryClient.invalidateQueries({ queryKey: ["subtasks", "bulk"] });
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
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
            queryClient.invalidateQueries({ queryKey: ["subtasks", "bulk"] });
        },
    });
}

export function useReorderSubtasks(taskId: string) {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, newOrderIndex }: { id: string; newOrderIndex: number }) => {
            const res = await (api.api.subtasks as any)[":id"].reorder.$patch({
                param: { id },
                json: { orderIndex: newOrderIndex },
            });
            return unwrapResponse<Subtask>(res);
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: SUBTASKS_KEY(taskId) });
            const previous = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY(taskId));

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

            return { previous };
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
                updateBulkSubtasksCaches(queryClient, taskId, () => context.previous ?? []);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
            queryClient.invalidateQueries({ queryKey: ["subtasks", "bulk"] });
        },
    });
}
