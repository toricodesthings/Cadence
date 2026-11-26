import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Habit, RoutineShareMode } from "@cadence/contracts/habit";
import type { RoutineShareWay } from "@cadence/contracts/sharing";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, toastName, undoWindow } from "../../lib/utils/undo-toast";
import { habitCache } from "../habits/optimistic-helpers";
import { copyInviteUrl, toastUncopiedLink, useResetLinksMutation, useSharedPeopleQuery } from "./use-share-list";

export function isSharedRoutine(habit: Pick<Habit, "access" | "members">): boolean {
    return (habit.access !== undefined && habit.access !== "owner") || (habit.members?.length ?? 0) > 0;
}

export function useRoutinePeople(habit: Pick<Habit, "id" | "access" | "members"> | undefined) {
    const client = useApiClient();
    return useSharedPeopleQuery(queryKeys.routinePeople, habit, Boolean(habit && isSharedRoutine(habit)), async (id) =>
        unwrapResponse(await client.api.habits[":id"].people.$get({ param: { id } })),
    );
}

export function useCreateRoutineLink() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ habitId, way }: { habitId: string; way: RoutineShareWay }) => {
            const { url } = await unwrapResponse(
                await client.api.habits[":id"].invites.$post({ param: { id: habitId }, json: { way } }),
            );
            return copyInviteUrl(url);
        },
        onSuccess: (result) => {
            toastUncopiedLink(result);
            void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        },
        onError: (err) => toastError(err, "Couldn't make a link"),
    });
}

export function useResetRoutineLinks() {
    const client = useApiClient();
    return useResetLinksMutation(async (habitId) =>
        unwrapResponse(await client.api.habits[":id"].invites.$delete({ param: { id: habitId } })),
    );
}

export function useSetRoutineMode() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ habitId, mode }: { habitId: string; mode: RoutineShareMode }) =>
            unwrapResponse(await client.api.habits[":id"].mode.$patch({ param: { id: habitId }, json: { mode } })),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        },
        onError: (err) => toastError(err, "Couldn't switch sharing mode"),
    });
}

export function useSetTurnOrder() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ habitId, order }: { habitId: string; order: string[] }) =>
            unwrapResponse(await client.api.habits[":id"].turns.$put({ param: { id: habitId }, json: { order } })),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        },
        onError: (err) => toastError(err, "Couldn't update turn order"),
    });
}

export function useRemoveFromRoutine() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ habitId, userId }: { habitId: string; userId: string }) =>
            unwrapResponse(
                await client.api.habits[":id"].members[":userId"].$delete({ param: { id: habitId, userId } }),
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        },
        onError: (err) => toastError(err, "Couldn't stop sharing with them"),
    });
}

export function useLeaveRoutine() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    return useMutation({
        mutationFn: async ({ habitId, title, cheering }: { habitId: string; title: string; cheering?: boolean }) => {
            await undoWindow(toastName(title), {
                description: cheering ? "Stopped cheering" : "Removed from your routines",
            });
            return unwrapResponse(
                await client.api.habits[":id"].members[":userId"].$delete({
                    param: { id: habitId, userId: session!.user.id },
                }),
            );
        },
        onMutate: ({ habitId }) => habitCache.edit(queryClient, (items) => items.filter((h) => h.id !== habitId)),
        onError: (err, _vars, context) => habitCache.undo(queryClient, err, context, "Couldn't leave routine"),
        onSettled: () => habitCache.invalidate(queryClient),
    });
}

export function useStopSharingRoutine() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (habitId: string) =>
            unwrapResponse(await client.api.habits[":id"].members.$delete({ param: { id: habitId } })),
        onSuccess: () => {
            toast.success("Not shared any more.");
            void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        },
        onError: (err) => toastError(err, "Couldn't stop sharing"),
    });
}

export function useCheer() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ habitId, title, targetDate }: { habitId: string; title: string; targetDate: string }) => {
            await undoWindow(toastName(title), { description: "Cheered" });
            const res = await client.api.habits[":id"].cheers.$post({
                param: { id: habitId },
                json: { targetDate },
            });
            if (!res.ok) throw new Error(`Cheer failed (${res.status})`);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
        },
        onError: (err) => {
            if (!isUndone(err)) toastError(err, "Couldn't send cheer");
        },
    });
}
