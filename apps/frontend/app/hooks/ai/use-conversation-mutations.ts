/**
 * Conversation mutations (ai_frontend.md §5.1) — rename / archive / delete / clear archive.
 *
 * All are optimistic against the `queryKeys.ai.conversations` list cache
 * and invalidate on settle, mirroring the domain-hook convention
 * (hooks/tasks/use-update-task.ts).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";
import type { ConversationListItem } from "@cadence/contracts/ai";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, undoWindow } from "../../lib/utils/undo-toast";

type ListSnapshot = ConversationListItem[] | undefined;

function patchList(
    queryClient: ReturnType<typeof useQueryClient>,
    update: (rows: ConversationListItem[]) => ConversationListItem[],
): ListSnapshot {
    const snapshot = queryClient.getQueryData<ConversationListItem[]>(queryKeys.ai.conversations);
    queryClient.setQueryData<ConversationListItem[]>(queryKeys.ai.conversations, (old) =>
        old ? update(old) : old,
    );
    return snapshot;
}

type ConversationPatch = { id: string; title?: string; archived?: boolean; learn?: boolean };

/** Change a conversation's title or flags, shown in the list at once and put back if the server refuses. */
function useConversationPatch(failure: string) {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...json }: ConversationPatch) => unwrapResponse(await client.api.ai.conversations[":id"].$patch({ param: { id }, json })),
        onMutate: async ({ id, ...patch }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            return { snapshot: patchList(queryClient, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))) };
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            toastError(err, failure);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations }),
    });
}

/** Rename a conversation (optimistic title swap). */
export const useRenameConversation = () => useConversationPatch("Couldn’t rename that conversation");

/** Archive / unarchive a conversation (optimistic flag flip). */
export const useArchiveConversation = () => useConversationPatch("Couldn’t update that conversation");

/** "Don't learn from this chat" (optimistic flag flip): memory skips the thread. */
export const useSetConversationLearn = () => useConversationPatch("Couldn’t update that conversation");

/** Delete a conversation (optimistic remove from the list). */
export function useDeleteConversation() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        // The row disappears at once; the server hears about it only once Undo's window closes.
        mutationFn: async ({ id, title }: { id: string; title: string }) => {
            await undoWindow(`Deleted ${title}`);
            const res = await client.api.ai.conversations[":id"].$delete({ param: { id } });
            return unwrapResponse(res);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            const snapshot = patchList(queryClient, (rows) => rows.filter((r) => r.id !== id));
            return { snapshot };
        },
        onError: (err, _id, context) => {
            if (context?.snapshot) {
                queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            }
            if (!isUndone(err)) toastError(err, "Couldn’t delete that conversation");
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations }),
    });
}

/** Delete every archived conversation (optimistic remove of all archived rows). */
export function useClearArchive() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const res = await client.api.ai.conversations.archived.$delete();
            return unwrapResponse(res);
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            const snapshot = patchList(queryClient, (rows) => rows.filter((r) => !r.archived));
            return { snapshot };
        },
        onSuccess: ({ deleted }) => {
            toast.success(
                deleted === 0
                    ? "The archive is already empty"
                    : deleted === 1
                      ? "Deleted 1 archived conversation"
                      : `Deleted ${deleted} archived conversations`,
            );
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) {
                queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            }
            toastError(err, "Couldn’t clear the archive");
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.ai.conversations }),
    });
}
