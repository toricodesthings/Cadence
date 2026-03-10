import { useMemo } from "react";
import { createApiClient, type ApiClient } from "../lib/api/client";
import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import { authenticatedFetch } from "../lib/api/client";
import { useAuthState } from "./use-auth-state";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

/** Returns a typed Hono client pre-authenticated with the current session's JWT.
 * The explicit `as ApiClient` cast is required because cross-project Hono RPC
 * types don't resolve cleanly through tsc when the backend uses Cloudflare Worker types.
 * Vite/esbuild handles this correctly at runtime.
 */
export function useApiClient(): ApiClient {
    const { session } = useAuthState();
    const tokenRefreshBoundary = session?.session?.token;

    return useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return hc<AppType>(BASE_URL, {
            fetch: async (input: RequestInfo | URL, requestInit?: RequestInit) => {
                return authenticatedFetch(input, {
                    ...requestInit,
                    authenticated: true,
                });
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any as ApiClient;
    }, [tokenRefreshBoundary]);
}
