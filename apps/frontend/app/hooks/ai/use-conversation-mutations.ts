import { refetchAfterWrites } from "../../lib/api/write-gate";
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
    queryClient.setQueryData<ConversationListItem[]>(queryKeys.ai.conversations, (old) => (old ? update(old) : old));
    return snapshot;
}

type ConversationPatch = { id: string; title?: string; archived?: boolean; learn?: boolean };

function useConversationPatch(failure: string) {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, ...json }: ConversationPatch) =>
            unwrapResponse(await client.api.ai.conversations[":id"].$patch({ param: { id }, json })),
        onMutate: async ({ id, ...patch }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.conversations });
            return {
                snapshot: patchList(queryClient, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
            };
        },
        onError: (err, _vars, context) => {
            if (context?.snapshot) queryClient.setQueryData(queryKeys.ai.conversations, context.snapshot);
            toastError(err, failure);
        },
        onSettled: () => refetchAfterWrites(queryClient, queryKeys.ai.conversations),
    });
}

export const useRenameConversation = () => useConversationPatch("Couldn’t rename that conversation");

export const useArchiveConversation = () => useConversationPatch("Couldn’t update that conversation");

export const useSetConversationLearn = () => useConversationPatch("Couldn’t update that conversation");

export function useDeleteConversation() {
    const client = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
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
        onSettled: () => refetchAfterWrites(queryClient, queryKeys.ai.conversations),
    });
}

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
        onSettled: () => refetchAfterWrites(queryClient, queryKeys.ai.conversations),
    });
}
