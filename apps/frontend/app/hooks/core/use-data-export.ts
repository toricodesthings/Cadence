/** Data export: the latest request's status (polled while it is being prepared) and the request itself. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";

export function useDataExport() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: queryKeys.dataExport,
        enabled: authReady && isAuthenticated,
        refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
        queryFn: async () => unwrapResponse(await client.api.account.export.$get()),
    });
}

export function useRequestDataExport() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => unwrapResponse(await client.api.account.export.$post()),
        onSuccess: (request) => {
            queryClient.setQueryData(queryKeys.dataExport, request);
            toast.success(`Your export is on its way to ${request.email}.`);
        },
        onError: (error) => toastError(error, "Couldn't start your export"),
    });
}
