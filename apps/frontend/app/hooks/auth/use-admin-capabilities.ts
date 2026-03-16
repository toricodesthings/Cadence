import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./use-api-client";
import { useAuthState } from "./use-auth-state";

export function useAdminCapabilities() {
    const api = useApiClient();
    const { authReady, isAuthenticated, session } = useAuthState();

    return useQuery({
        queryKey: ["admin-capabilities", session?.session?.token ?? null],
        enabled: authReady && isAuthenticated,
        retry: false,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const response = await api.api.debug.capabilities.$get();
            if (response.status === 403 || response.status === 404) {
                return { canUseDeveloperTools: false };
            }
            if (!response.ok) {
                throw new Error("Failed to load admin capabilities");
            }

            const payload = await response.json();
            return {
                canUseDeveloperTools: payload.data.canUseDeveloperTools,
            };
        },
    });
}
