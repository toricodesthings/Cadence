/**
 * Connected assistants (MCP): the Settings list, Disconnect, and the consent
 * page's request. Approving or declining returns a URL on the MCP origin that
 * the same browser must open next: the OAuth callback checks the cookie this
 * browser got when the assistant started connecting.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { McpScope } from "@cadence/contracts/connections";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";

export function useConnections(enabled = true) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: queryKeys.connections.all,
        enabled: enabled && authReady && isAuthenticated,
        queryFn: async () => unwrapResponse(await client.api.connections.$get()),
    });
}

export function useDisconnect() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) =>
            unwrapResponse(await client.api.connections[":id"].$delete({ param: { id } })),
        onSuccess: () => toast.success("Disconnected"),
        onError: (error) => toastError(error, "Couldn't disconnect"),
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.connections.all }),
    });
}

export function useConnectRequest(request: string | null) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: queryKeys.connections.request(request ?? ""),
        enabled: Boolean(request) && authReady && isAuthenticated,
        retry: false,
        staleTime: Infinity,
        meta: { persist: false },
        queryFn: async () =>
            unwrapResponse(await client.api.connections.requests[":request"].$get({ param: { request: request! } })),
    });
}

/** Approve (with scopes) or decline; resolves to where the browser goes next. */
export function useAnswerConnectRequest(request: string) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (answer: { scopes: McpScope[] } | null) => {
            const param = { request };
            const res = answer
                ? await client.api.connections.requests[":request"].approve.$post({
                    param,
                    json: { scopes: answer.scopes, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                })
                : await client.api.connections.requests[":request"].decline.$post({ param });
            return (await unwrapResponse(res)).redirectTo;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.connections.all }),
    });
}
