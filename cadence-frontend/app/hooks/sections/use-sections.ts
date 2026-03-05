import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { TaskSection } from "../../types/task";

const SECTIONS_KEY = ["sections"] as const;

export function useSections() {
    const client = useApiClient();

    return useQuery({
        queryKey: SECTIONS_KEY,
        queryFn: async () => {
            const res = await client.api.sections.$get();
            return unwrapResponse<TaskSection[]>(res);
        },
    });
}

export function useCreateSection() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { name: string; orderIndex: number }) => {
            const res = await client.api.sections.$post({ json: input });
            return unwrapResponse<TaskSection>(res);
        },
        onMutate: async (newSection) => {
            await queryClient.cancelQueries({ queryKey: SECTIONS_KEY });
            const previous = queryClient.getQueryData<TaskSection[]>(SECTIONS_KEY);

            const optimistic: TaskSection = {
                id: `temp-${Date.now()}`,
                userId: "",
                name: newSection.name,
                orderIndex: newSection.orderIndex,
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueryData<TaskSection[]>(SECTIONS_KEY, (old) => {
                const list = [...(old || []), optimistic];
                return list.sort((a, b) => a.orderIndex - b.orderIndex);
            });

            return { previous };
        },
        onError: (_err, _new, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SECTIONS_KEY, context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SECTIONS_KEY });
        },
    });
}

export function useUpdateSection() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...updates }: { id: string; name?: string; orderIndex?: number }) => {
            const res = await (client.api.sections as any)[":id"].$patch({
                param: { id },
                json: updates,
            });
            return unwrapResponse<TaskSection>(res);
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: SECTIONS_KEY });
            const previous = queryClient.getQueryData<TaskSection[]>(SECTIONS_KEY);

            queryClient.setQueryData<TaskSection[]>(SECTIONS_KEY, (old) => {
                if (!old) return old;
                return old
                    .map((s) => (s.id === variables.id ? { ...s, ...variables } : s))
                    .sort((a, b) => a.orderIndex - b.orderIndex);
            });

            return { previous };
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SECTIONS_KEY, context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SECTIONS_KEY });
        },
    });
}

export function useDeleteSection() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await (client.api.sections as any)[":id"].$delete({
                param: { id },
            });
            if (!res.ok) throw new Error("Failed to delete section");
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: SECTIONS_KEY });
            const previous = queryClient.getQueryData<TaskSection[]>(SECTIONS_KEY);

            queryClient.setQueryData<TaskSection[]>(SECTIONS_KEY, (old) => {
                if (!old) return old;
                return old.filter((s) => s.id !== id);
            });

            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(SECTIONS_KEY, context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SECTIONS_KEY });
        },
    });
}
