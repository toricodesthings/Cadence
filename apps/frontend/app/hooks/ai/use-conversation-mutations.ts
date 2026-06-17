/**
 * Conversation mutations (ai_frontend.md §5.1) — rename / archive / delete.
 *
 * All three are optimistic against the `queryKeys.ai.conversations` list cache
 * and invalidate on settle, mirroring the domain-hook convention
 * (hooks/tasks/use-update-task.ts).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";
import type { ConversationSummary } from "./use-conversations";

type ListSnapshot = ConversationSummary[] | undefined;

function patchList(
    queryClient: ReturnType<typeof useQueryClient>,
    update: (rows: ConversationSummary[]) => ConversationSummary[],
): ListSnapshot {
    const snapshot = queryClient.getQueryData<ConversationSummary[]>(queryKeys.ai.conversations);
    queryClient.setQueryData<ConversationSummary[]>(queryKeys.ai.conversations, (old) =>
        old ? update(old) : old,
    );
    return snapshot;
}

/** Rename a conversation (optimistic title swap). */
export function useRenameConversation() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }) => {
            const res = await client.api.ai.conversations[":id"].$patch({
                param: { id },
                json: { title },
            });
            return unwrapResponse(res);
        },
        onMutate: async ({ id, title }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            const snapshot = patchList(queryClient, (rows) =>
                rows.map((r) => (r.id === id ? { ...r, title } : r)),
            );
            return { snapshot };
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) {
                queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            }
            toast.error(err instanceof Error ? err.message : "Couldn’t rename that conversation");
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations }),
    });
}

/** Archive / unarchive a conversation (optimistic flag flip). */
export function useArchiveConversation() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
            const res = await client.api.ai.conversations[":id"].$patch({
                param: { id },
                json: { archived },
            });
            return unwrapResponse(res);
        },
        onMutate: async ({ id, archived }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            const snapshot = patchList(queryClient, (rows) =>
                rows.map((r) => (r.id === id ? { ...r, archived } : r)),
            );
            return { snapshot };
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) {
                queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            }
            toast.error(err instanceof Error ? err.message : "Couldn’t update that conversation");
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations }),
    });
}

/** Delete a conversation (optimistic remove from the list). */
export function useDeleteConversation() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.ai.conversations[":id"].$delete({ param: { id } });
            return unwrapResponse(res);
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            const snapshot = patchList(queryClient, (rows) => rows.filter((r) => r.id !== id));
            return { snapshot };
        },
        onError: (err, _id, context) => {
            if (context?.snapshot) {
                queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            }
            toast.error(err instanceof Error ? err.message : "Couldn’t delete that conversation");
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations }),
    });
}
