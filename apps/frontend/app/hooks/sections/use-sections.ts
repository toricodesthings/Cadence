import { useQuery, useQueries, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import type { TaskSection } from "@cadence/contracts/section";
import type { Task } from "@cadence/contracts/task";
import { queryKeys } from "../../lib/api/query-keys";
import { useAuthState } from "../auth/use-auth-state";
import { transformListCache } from "../../lib/api/cache-guards";
import { clientIdFor } from "../../lib/api/optimistic-id";
import { wasQueued, withOfflineSupport } from "../../lib/api/offline-mutation";
import { isUndone, undoWindow } from "../../lib/utils/undo-toast";
import { toastError } from "../../lib/utils/error-toast";

function sectionsKey(projectId?: string | null) {
    return ["sections", projectId ?? "__none__"] as const;
}

/** `onMutate` for a section change: stop in-flight reads, remember the list, and show `edit` (kept in order) in it. */
async function beginEdit(queryClient: QueryClient, key: ReturnType<typeof sectionsKey>, edit: (items: TaskSection[]) => TaskSection[], initialize = false) {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<TaskSection[]>(key);
    queryClient.setQueryData<TaskSection[]>(key, (old) => transformListCache(old, (items) => edit(items).sort((a, b) => a.orderIndex - b.orderIndex), { initialize }));
    return { previous };
}

function revertEdit(queryClient: QueryClient, key: ReturnType<typeof sectionsKey>, context: { previous?: TaskSection[] } | undefined) {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
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
            return unwrapResponse(res);
        },
    });
}

/** Every list's sections (same cache as `useSections`), for naming a section in words. Loads only while `enabled`. */
export function useAllSections(projectIds: string[], enabled = true): TaskSection[] {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQueries({
        queries: projectIds.map((projectId) => ({
            queryKey: sectionsKey(projectId),
            enabled: enabled && authReady && isAuthenticated,
            queryFn: async () => unwrapResponse(await client.api.sections.$get({ query: { projectId } })),
        })),
        combine: (results) => results.flatMap((r) => (r.data ?? []) as TaskSection[]),
    });
}

export function useCreateSection(projectId?: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const key = sectionsKey(projectId);

    return useMutation({
        mutationFn: withOfflineSupport<{ name: string; orderIndex: number }, TaskSection>(
            (input) => ({ type: "create_section", payload: { ...input, id: clientIdFor(input), projectId: projectId ?? null } }),
            async (input) => {
                const id = clientIdFor(input);
                const res = await client.api.sections.$post(
                    { json: { ...input, id, projectId: projectId ?? null } },
                    { headers: { "Idempotency-Key": id } },
                );
                return unwrapResponse(res);
            },
        ),
        onMutate: (newSection) => {
            const optimistic: TaskSection = {
                id: clientIdFor(newSection),
                userId: "",
                projectId: projectId ?? null,
                name: newSection.name,
                orderIndex: newSection.orderIndex,
                createdAt: new Date().toISOString(),
            };
            return beginEdit(queryClient, key, (items) => [...items, optimistic], true);
        },
        onError: (_err, _vars, context) => revertEdit(queryClient, key, context),
        onSettled: (data, error) => {
            if (!wasQueued(data, error)) queryClient.invalidateQueries({ queryKey: key });
        },
    });
}

export function useUpdateSection(projectId?: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const key = sectionsKey(projectId);

    return useMutation({
        mutationFn: withOfflineSupport<{ id: string; name?: string; orderIndex?: number }, TaskSection>(
            ({ id, ...payload }) => ({ type: "update_section", id, payload }),
            async ({ id, ...updates }) => unwrapResponse(await client.api.sections[":id"].$patch({ param: { id }, json: updates })),
        ),
        onMutate: (variables) => beginEdit(queryClient, key, (items) => items.map((s) => (s.id === variables.id ? { ...s, ...variables } : s))),
        onError: (_err, _vars, context) => revertEdit(queryClient, key, context),
        onSettled: (data, error) => {
            if (!wasQueued(data, error)) queryClient.invalidateQueries({ queryKey: key });
        },
    });
}

export function useDeleteSection(projectId?: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const key = sectionsKey(projectId);

    return useMutation({
        // The section disappears at once; the server hears about it only once Undo's window closes.
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            await undoWindow(`Deleted ${name}`, { description: "Its tasks stay in the list." });
            const res = await client.api.sections[":id"].$delete({
                param: { id },
            });
            if (!res.ok) throw new Error("Failed to delete section");
        },
        onMutate: async ({ id }) => {
            const { previous } = await beginEdit(queryClient, key, (items) => items.filter((s) => s.id !== id));
            // The server sets the section's tasks to unsectioned; mirror it so they stay visible.
            await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
            const previousTasks = queryClient.getQueriesData({ queryKey: queryKeys.tasks.all });
            queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.all }, (old) =>
                transformListCache(old, (items) => items.map((t) => (t.sectionId === id ? { ...t, sectionId: null } : t))),
            );

            return { previous, previousTasks };
        },
        onError: (err, _input, context) => {
            revertEdit(queryClient, key, context);
            for (const [taskKey, data] of context?.previousTasks ?? []) queryClient.setQueryData(taskKey, data);
            if (!isUndone(err)) toastError(err, "Couldn't delete section");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: key });
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        },
    });
}
