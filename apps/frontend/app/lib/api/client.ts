import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import { ApiErrorResponse } from "../../types/api";
import { authClient } from "../auth-client";
import { readDesktopAuthSession } from "../desktop-auth-session";
import { API_BASE_URL, NEON_AUTH_URL } from "../env";
import { platformFetch } from "../../platform/runtime";

export interface AuthenticatedFetchOptions extends RequestInit {
    authenticated?: boolean;
}

function looksLikeJwt(token: unknown): token is string {
    return typeof token === "string" && token.split(".").length === 3;
}

export async function fetchAuthJwt(): Promise<string | null> {
    const response = await fetch(`${NEON_AUTH_URL}/token`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    if (!response.ok) {
        if (import.meta.env.DEV) {
            console.warn("[cadence:api-auth] /token request failed", response.status, response.statusText);
        }
        return null;
    }

    const payload = await response.json().catch(() => null) as
        | { token?: unknown; data?: { token?: unknown } }
        | null;

    const token = payload?.token ?? payload?.data?.token;
    return looksLikeJwt(token) ? token : null;
}

export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: AuthenticatedFetchOptions = {},
): Promise<Response> {
    const { authenticated = false, ...requestInit } = init;
    const headers = new Headers(requestInit.headers);

    if (authenticated) {
        const desktopSession = await readDesktopAuthSession();
        const sessionResult = await authClient.getSession();
        const candidateTokens = [
            await fetchAuthJwt(),
            desktopSession?.jwt,
            sessionResult?.data?.session?.token,
        ];
        const token = candidateTokens.find(looksLikeJwt) ?? undefined;

        if (!token) {
            throw new ApiErrorResponse({
                status: 401,
                code: "UNAUTHORIZED",
                message: "Authentication token is unavailable",
            });
        }

        headers.set("Authorization", `Bearer ${token}`);
        if ((requestInit.method ?? "GET").toUpperCase() === "GET") {
            requestInit.cache = "no-store";
        }
    }

    return platformFetch(input, { ...requestInit, headers });
}

/**
 * Create a typed Hono RPC client with optional auth token injection.
 * Note: The return type assertion `as ApiClient` is required because tsc cannot
 * fully resolve the cross-project Hono generic when the backend uses Cloudflare
 * Worker bindings. The actual runtime type is correct — Vite/esbuild resolves it fine.
 */
export function createApiClient(token?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = hc<AppType>(API_BASE_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        fetch: platformFetch,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // Backend routes mount under /api/v1/ — expose the v1 subtree as `.api`
    return { api: root.api.v1 };
}

// Derive as any to avoid circular-unknown collapse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiClient = ReturnType<typeof createApiClient>;
