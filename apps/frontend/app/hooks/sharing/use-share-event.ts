import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SharedEvent } from "@cadence/contracts/personal-event";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { toastName, undoWindow } from "../../lib/utils/undo-toast";
import { personalEventCache } from "../calendar/personal-event-cache";
import { copyInviteUrl, toastUncopiedLink, useResetLinksMutation, useSharedPeopleQuery } from "./use-share-list";

const withEventMembers = (
    items: SharedEvent[],
    id: string,
    change: (members: SharedEvent["members"]) => SharedEvent["members"],
) => items.map((event) => (event.id === id ? { ...event, members: change(event.members) } : event));

export function isSharedEvent(event: Partial<Pick<SharedEvent, "access" | "members">>): boolean {
    return (event.access ?? "owner") !== "owner" || (event.members?.length ?? 0) > 0;
}

export function useEventPeople(
    event: (Pick<SharedEvent, "id"> & Partial<Pick<SharedEvent, "access" | "members">>) | undefined,
) {
    const client = useApiClient();
    return useSharedPeopleQuery(queryKeys.eventPeople, event, Boolean(event && isSharedEvent(event)), async (id) =>
        unwrapResponse(await client.api["personal-events"][":id"].people.$get({ param: { id } })),
    );
}

export function useCreateEventLink() {
    const client = useApiClient();
    return useMutation({
        mutationFn: async (eventId: string) => {
            const { url } = await unwrapResponse(
                await client.api["personal-events"][":id"].invites.$post({ param: { id: eventId } }),
            );
            return copyInviteUrl(url);
        },
        onSuccess: toastUncopiedLink,
        onError: (err) => toastError(err, "Couldn't make a link"),
    });
}

export function useResetEventLinks() {
    const client = useApiClient();
    return useResetLinksMutation(
        async (eventId) =>
            unwrapResponse(await client.api["personal-events"][":id"].invites.$delete({ param: { id: eventId } })),
        "Link reset. The old ones no longer work.",
        "Couldn't reset link",
    );
}

export function useRemoveFromEvent() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) =>
            unwrapResponse(
                await client.api["personal-events"][":id"].members[":userId"].$delete({
                    param: { id: eventId, userId },
                }),
            ),
        onMutate: ({ eventId, userId }) =>
            personalEventCache.edit(queryClient, (items) =>
                withEventMembers(items, eventId, (members) => members.filter((m) => m.userId !== userId)),
            ),
        onError: (err, _vars, context) => {
            if (context) personalEventCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't stop sharing with them");
        },
        onSettled: () => personalEventCache.invalidate(queryClient),
    });
}

export function useRemoveFromMyEvents() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    return useMutation({
        mutationFn: async ({ eventId, label }: { eventId: string; label: string }) => {
            await undoWindow(toastName(label), { description: "Removed from your events" });
            return unwrapResponse(
                await client.api["personal-events"][":id"].members[":userId"].$delete({
                    param: { id: eventId, userId: session!.user.id },
                }),
            );
        },
        onMutate: ({ eventId }) =>
            personalEventCache.edit(queryClient, (items) => items.filter((e) => e.id !== eventId)),
        onError: (err, _vars, context) =>
            personalEventCache.undo(queryClient, err, context, "Couldn't remove from your events"),
        onSettled: () => personalEventCache.invalidate(queryClient),
    });
}

export function useStopSharingEvent() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (eventId: string) =>
            unwrapResponse(await client.api["personal-events"][":id"].members.$delete({ param: { id: eventId } })),
        onMutate: (eventId) =>
            personalEventCache.edit(queryClient, (items) => withEventMembers(items, eventId, () => [])),
        onSuccess: () => toast.success("Not shared any more."),
        onError: (err, _eventId, context) => {
            if (context) personalEventCache.rollback(queryClient, context.snapshot);
            toastError(err, "Couldn't stop sharing");
        },
        onSettled: () => personalEventCache.invalidate(queryClient),
    });
}
