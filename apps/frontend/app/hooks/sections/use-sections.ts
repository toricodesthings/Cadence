import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { TaskSection } from "../../types/task";
import { useAuthState } from "../use-auth-state";
import { transformListCache } from "../../lib/api/cache-guards";
import { invalidateEverywhere } from "../../lib/api/workspace-cache";

function sectionsKey(projectId?: string | null) {
    return ["sections", projectId ?? "__none__"] as const;
}

export function useSections(projectId?: string | null) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: sectionsKey(projectId),
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const query = projectId ? { projectId } : {};
            const res = await client.api.sections.$get({ query });
            return unwrapResponse<TaskSection[]>(res);
        },
    });
}

export function useCreateSection(projectId?: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const key = sectionsKey(projectId);

    return useMutation({
        mutationFn: async (input: { name: string; orderIndex: number }) => {
            const res = await client.api.sections.$post({
                json: { ...input, projectId: projectId ?? null },
            });
            return unwrapResponse<TaskSection>(res);
        },
        onMutate: async (newSection) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<TaskSection[]>(key);

            const optimistic: TaskSection = {
                id: `temp-${Date.now()}`,
                userId: "",
                projectId: projectId ?? null,
                name: newSection.name,
                orderIndex: newSection.orderIndex,
                createdAt: new Date().toISOString(),
            };

            queryClient.setQueryData<TaskSection[]>(key, (old) => {
                const list = [...(Array.isArray(old) ? old : []), optimistic];
                return list.sort((a, b) => a.orderIndex - b.orderIndex);
            });

            return { previous };
        },
        onError: (_err, _new, context) => {
            if (context?.previous) {
                queryClient.setQueryData(key, context.previous);
            }
        },
        onSettled: () => {
            invalidateEverywhere(queryClient, key);
        },
    });
}

export function useUpdateSection(projectId?: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const key = sectionsKey(projectId);

    return useMutation({
        mutationFn: async ({ id, ...updates }: { id: string; name?: string; orderIndex?: number }) => {
            const res = await (client.api.sections as any)[":id"].$patch({
                param: { id },
                json: updates,
            });
            return unwrapResponse<TaskSection>(res);
        },
        onMutate: async (variables) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<TaskSection[]>(key);

            queryClient.setQueryData<TaskSection[]>(key, (old) => {
                return transformListCache(old, (items) =>
                    items
                        .map((s) => (s.id === variables.id ? { ...s, ...variables } : s))
                        .sort((a, b) => a.orderIndex - b.orderIndex),
                );
            });

            return { previous };
        },
        onError: (_err, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(key, context.previous);
            }
        },
        onSettled: () => {
            invalidateEverywhere(queryClient, key);
        },
    });
}

export function useDeleteSection(projectId?: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const key = sectionsKey(projectId);

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await (client.api.sections as any)[":id"].$delete({
                param: { id },
            });
            if (!res.ok) throw new Error("Failed to delete section");
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<TaskSection[]>(key);

            queryClient.setQueryData<TaskSection[]>(key, (old) => {
                return transformListCache(old, (items) => items.filter((s) => s.id !== id));
            });

            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(key, context.previous);
            }
        },
        onSettled: () => {
            invalidateEverywhere(queryClient, key);
        },
    });
}
