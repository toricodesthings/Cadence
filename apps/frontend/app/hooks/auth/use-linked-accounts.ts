import { useQuery } from "@tanstack/react-query";
import { authClient } from "../../lib/auth-client";
import { queryKeys } from "../../lib/api/query-keys";

/** The account's sign-in methods: "credential" (email + password) and each linked OAuth provider. */
export function useLinkedAccounts() {
    return useQuery({
        queryKey: queryKeys.auth.accounts,
        queryFn: async () => (await authClient.listAccounts()).data ?? [],
    });
}
