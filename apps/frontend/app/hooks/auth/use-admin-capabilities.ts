import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./use-api-client";
import { useAuthState } from "./use-auth-state";
import { StartupReadyContext } from "../core/use-workspace-startup";

// Production keeps /debug dark (404), so builds there never ask. Builds pointed at a
// backend with ENABLE_DEBUG_ROUTES set opt in with VITE_ENABLE_DEBUG_ROUTES=true.
const DEBUG_ROUTES_BUILD = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_ROUTES === "true";

export function useAdminCapabilities() {
    const api = useApiClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    // Never part of startup: the developer tools entry can appear after reveal.
    const revealed = useContext(StartupReadyContext);

    return useQuery({
        queryKey: ["admin-capabilities", session?.user.id ?? null],
        meta: { persist: false },
        enabled: DEBUG_ROUTES_BUILD && revealed && authReady && isAuthenticated,
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
