import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";

export function useInboxSections() {
    const api = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();

    return useQuery({
        queryKey: ["inbox_sections"],
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await api.inbox.sections.$get();
            if (!res.ok) throw new Error("Failed to fetch inbox sections");
            const { data } = await res.json();
            return data;
        },
    });
}
