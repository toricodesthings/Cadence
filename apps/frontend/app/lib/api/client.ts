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

// JWT token cache: avoids hitting /token on every single authenticated request.
// The cache stores the token + expiry timestamp and deduplicates concurrent requests.
let _cachedJwt: string | null = null;
let _cachedJwtExpiry = 0;
let _inflight: Promise<string | null> | null = null;
const JWT_CACHE_TTL_MS = 55_000; // 55 seconds — conservative under a typical 60s token lifetime

async function _fetchAuthJwtOnce(): Promise<string | null> {
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

export async function fetchAuthJwt(): Promise<string | null> {
    // Return cached token if still valid
    if (_cachedJwt && Date.now() < _cachedJwtExpiry) {
        return _cachedJwt;
    }

    // Deduplicate: if a request is already in flight, piggyback on it
    if (_inflight) {
        return _inflight;
    }

    _inflight = _fetchAuthJwtOnce().then((token) => {
        _cachedJwt = token;
        _cachedJwtExpiry = token ? Date.now() + JWT_CACHE_TTL_MS : 0;
        return token;
    }).finally(() => {
        _inflight = null;
    });

    return _inflight;
}

/** Invalidate the JWT cache — call after auth recovery or sign-out. */
export function clearAuthJwtCache(): void {
    _cachedJwt = null;
    _cachedJwtExpiry = 0;
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
        const neonJwt = await fetchAuthJwt();
        const desktopJwt = desktopSession?.jwt;
        const sdkJwt = sessionResult?.data?.session?.token;
        const candidateTokens = [neonJwt, desktopJwt, sdkJwt];
        const token = candidateTokens.find(looksLikeJwt) ?? undefined;

        if (!token) {
            console.warn("[cadence:api-auth] authenticated request has no usable JWT", {
                request: typeof input === "string"
                    ? input
                    : input instanceof URL
                        ? input.toString()
                        : input.url,
                desktopSessionPresent: Boolean(desktopSession),
                sdkSessionPresent: Boolean(sessionResult?.data?.session),
            });
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

    const requestUrl = typeof input === "string"
        ? input
        : input instanceof URL
            ? input.toString()
            : input.url;

    const response = await platformFetch(input, { ...requestInit, headers });

    return response;
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
