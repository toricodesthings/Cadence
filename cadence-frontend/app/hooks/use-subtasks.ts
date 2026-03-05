import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./use-api-client";
import { unwrapResponse } from "../lib/api/helpers";
import type { Subtask } from "../types/task";

const SUBTASKS_KEY = (taskId: string) => ["tasks", taskId, "subtasks"] as const;

export function useSubtasks(taskId: string) {
    const api = useApiClient();
    return useQuery({
        queryKey: SUBTASKS_KEY(taskId),
        queryFn: async () => {
            const res = await (api.api.tasks as any)[":taskId"].subtasks.$get({
                param: { taskId },
            });
            return unwrapResponse<Subtask[]>(res);
        },
        enabled: !!taskId,
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
                const list = [...(old || []), optimistic];
                return list.sort((a, b) => a.orderIndex - b.orderIndex);
            });

            return { previous };
        },
        onError: (_err, _new, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
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
                if (!old) return old;
                return old.map((st) => (st.id === variables.id ? { ...st, ...variables } : st));
            });

            return { previous };
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
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
                if (!old) return old;
                return old.filter((st) => st.id !== id);
            });

            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
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
                if (!old) return old;
                return old
                    .map((st) => (st.id === variables.id ? { ...st, orderIndex: variables.newOrderIndex } : st))
                    .sort((a, b) => a.orderIndex - b.orderIndex);
            });

            return { previous };
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SUBTASKS_KEY(taskId), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SUBTASKS_KEY(taskId) });
        },
    });
}
