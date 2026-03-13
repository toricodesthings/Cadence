import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import { ApiErrorResponse } from "../../types/api";
import { authClient } from "../auth-client";
import { API_BASE_URL } from "../env";

export interface AuthenticatedFetchOptions extends RequestInit {
    authenticated?: boolean;
}

export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: AuthenticatedFetchOptions = {},
): Promise<Response> {
    const { authenticated = false, ...requestInit } = init;
    const headers = new Headers(requestInit.headers);

    if (authenticated) {
        const sessionResult = await authClient.getSession();
        const token = sessionResult?.data?.session?.token as string | undefined;

        if (!token) {
            throw new ApiErrorResponse({
                status: 401,
                code: "UNAUTHORIZED",
                message: "Authentication is required",
            });
        }

        headers.set("Authorization", `Bearer ${token}`);
        if ((requestInit.method ?? "GET").toUpperCase() === "GET") {
            requestInit.cache = "no-store";
        }
    }

    return fetch(input, { ...requestInit, headers });
}

/**
 * Create a typed Hono RPC client with optional auth token injection.
 * Note: The return type assertion `as ApiClient` is required because tsc cannot
 * fully resolve the cross-project Hono generic when the backend uses Cloudflare
 * Worker bindings. The actual runtime type is correct — Vite/esbuild resolves it fine.
 */
export function createApiClient(token?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hc<AppType>(API_BASE_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
}

// Derive as any to avoid circular-unknown collapse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiClient = ReturnType<typeof createApiClient>;
