import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { ShareRole } from "@cadence/contracts/sharing";
import type { Project } from "@cadence/contracts/project";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { toastName } from "../../lib/utils/undo-toast";
import { projectCache } from "../projects/optimistic-helpers";

const withMembers = (items: Project[], id: string, change: (members: Project["members"]) => Project["members"]) =>
    items.map((project) => (project.id === id ? { ...project, members: change(project.members) } : project));

/**
 * Copy a new link that lets people view or edit: it works for 7 days, and earlier links keep working until they expire.
 * Resolves `copied: false` when the clipboard refused; the link is then shown so it can be copied by hand.
 */
export function useCreateInvite() {
    const client = useApiClient();
    return useMutation({
        mutationFn: async ({ listId, role }: { listId: string; role: ShareRole }) => {
            const { url } = await unwrapResponse(
                await client.api.lists[":id"].invites.$post({ param: { id: listId }, json: { role } }),
            );
            const copied = await navigator.clipboard.writeText(url).then(
                () => true,
                () => false,
            );
            return { url, copied };
        },
        // Copied: the button says so in place. Refused (no permission, or not a secure page): show the link instead.
        onSuccess: ({ url, copied }) => {
            if (!copied)
                toast.message("Here's your link. It works for 7 days.", { description: url, duration: 20_000 });
        },
        onError: (err) => toastError(err, "Couldn't make a link"),
    });
}

export function useResetInvites() {
    const client = useApiClient();
    return useMutation({
        mutationFn: async (listId: string) =>
            unwrapResponse(await client.api.lists[":id"].invites.$delete({ param: { id: listId } })),
        onSuccess: () => toast.success("Links reset. The old ones no longer work."),
        onError: (err) => toastError(err, "Couldn't reset links"),
    });
}

/**
 * A change to who is in a list, shown at once on every cached list and put back if the server says no.
 * `edit` is the change to that list's members (or, for Leave, to the lists themselves).
 */
function useMembershipMutation<V extends { listId: string }>(
    mutationFn: (variables: V) => Promise<unknown>,
    edit: (variables: V) => (items: Project[]) => Project[],
    failed: string,
    onSuccess?: (variables: V) => void,
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onMutate: (variables: V) => projectCache.edit(queryClient, edit(variables)),
        onSuccess: (_data, variables) => onSuccess?.(variables),
        onError: (err, _variables, context) => {
            if (context) projectCache.rollback(queryClient, context.snapshot);
            toastError(err, failed);
        },
        onSettled: () => projectCache.invalidate(queryClient),
    });
}

export function useSetMemberRole() {
    const client = useApiClient();
    return useMembershipMutation(
        async ({ listId, userId, role }: { listId: string; userId: string; role: ShareRole }) =>
            unwrapResponse(
                await client.api.lists[":id"].members[":userId"].$patch({
                    param: { id: listId, userId },
                    json: { role },
                }),
            ),
        ({ listId, userId, role }) =>
            (items) =>
                withMembers(items, listId, (members) =>
                    members.map((member) => (member.userId === userId ? { ...member, role } : member)),
                ),
        "Couldn't change that",
    );
}

export function useRemoveMember() {
    const client = useApiClient();
    return useMembershipMutation(
        async ({ listId, userId }: { listId: string; userId: string }) =>
            unwrapResponse(await client.api.lists[":id"].members[":userId"].$delete({ param: { id: listId, userId } })),
        ({ listId, userId }) =>
            (items) =>
                withMembers(items, listId, (members) => members.filter((member) => member.userId !== userId)),
        "Couldn't remove them",
    );
}

/** A member leaves: the list goes from their screen at once. */
export function useLeaveList() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { session } = useAuthState();
    return useMembershipMutation(
        async ({ listId }: { listId: string; name: string }) =>
            unwrapResponse(
                await client.api.lists[":id"].members[":userId"].$delete({
                    param: { id: listId, userId: session!.user.id },
                }),
            ),
        ({ listId }) =>
            (items) =>
                items.filter((project) => project.id !== listId),
        "Couldn't leave the list",
        ({ name }) => {
            toast.success(`Left ${toastName(name)}`);
            void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
            navigate("/today");
        },
    );
}

/** The owner stops sharing: everyone is out and every link dies. The caller confirms first. */
export function useStopSharing() {
    const client = useApiClient();
    return useMembershipMutation(
        async ({ listId }: { listId: string }) =>
            unwrapResponse(await client.api.lists[":id"].members.$delete({ param: { id: listId } })),
        ({ listId }) =>
            (items) =>
                withMembers(items, listId, () => []),
        "Couldn't stop sharing",
        () => toast.success("Not shared any more."),
    );
}

/** The owner hands a list over to a current member. Irreversible; caller confirms first. */
export function useTransferList() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ listId, userId }: { listId: string; userId: string; name: string }) =>
            unwrapResponse(await client.api.lists[":id"].transfer.$post({ param: { id: listId }, json: { userId } })),
        onSuccess: (_data, { name }) => {
            toast.success(`Made ${name} the owner.`);
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        },
        onError: (err) => toastError(err, "Couldn't transfer ownership"),
    });
}

/** What a link opens, for the screen shown before anything is joined. */
export function useInvitePreview(token: string | undefined) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: queryKeys.invitePreview(token ?? ""),
        enabled: Boolean(token) && authReady && isAuthenticated,
        retry: false,
        staleTime: Infinity,
        meta: { persist: false },
        queryFn: async () =>
            unwrapResponse(await client.api.lists["invite-preview"].$get({ query: { token: token! } })),
    });
}

export function useJoinList() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (token: string) =>
            (await unwrapResponse(await client.api.lists.join.$post({ json: { token } }))).listId,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        },
    });
}
