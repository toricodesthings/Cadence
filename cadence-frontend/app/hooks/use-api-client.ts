import { useMemo } from "react";
import { authClient } from "../lib/auth-client";
import { createApiClient, type ApiClient } from "../lib/api/client";
import { hc } from "hono/client";
import type { AppType } from "../../../cadence-backend/src/index";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

/** Returns a typed Hono client pre-authenticated with the current session's JWT.
 * The explicit `as ApiClient` cast is required because cross-project Hono RPC
 * types don't resolve cleanly through tsc when the backend uses Cloudflare Worker types.
 * Vite/esbuild handles this correctly at runtime.
 */
export function useApiClient(): ApiClient {
    // Only rebuild the client if the raw session token state changes (cache busting)
    const { data: session } = authClient.useSession();
    const tokenRefreshBoundary = session?.session?.token;

    return useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return hc<AppType>(BASE_URL, {
            fetch: async (input: RequestInfo | URL, requestInit?: RequestInit) => {
                let jwtToken = tokenRefreshBoundary as string | undefined | null;

                // Fallback: If not in immediate component state, query the Better Auth client locally.
                // The Neon Auth Plugin overrides data.session.token with the actual JWT string from headers.
                if (!jwtToken) {
                    try {
                        const sessionResult = await authClient.getSession();
                        jwtToken = sessionResult?.data?.session?.token as string | undefined;
                    } catch (e) {
                        console.warn("Failed to retrieve JWT token from auth client", e);
                    }
                }

                const headers = new Headers(requestInit?.headers);
                if (jwtToken) {
                    headers.set("Authorization", `Bearer ${jwtToken}`);
                }

                return fetch(input, { ...requestInit, headers });
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any as ApiClient;
    }, [tokenRefreshBoundary]);
}
