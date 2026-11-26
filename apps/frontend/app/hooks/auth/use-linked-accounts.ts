import { useQuery } from "@tanstack/react-query";
import { authClient } from "../../lib/auth-client";
import { queryKeys } from "../../lib/api/query-keys";

export function useLinkedAccounts() {
    return useQuery({
        queryKey: queryKeys.auth.accounts,
        queryFn: async () => (await authClient.listAccounts()).data ?? [],
    });
}
