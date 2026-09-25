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
let _authGeneration = 0;
const JWT_CACHE_TTL_MS = 55_000; // 55 seconds — conservative under a typical 60s token lifetime

async function _fetchAuthJwtOnce(): Promise<string | null> {
    const response = await fetch(`${NEON_AUTH_URL}/token`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) {
        if (import.meta.env.DEV) {
            console.warn("[cadence:api-auth] /token request failed", response?.status);
        }
        return null;
    }

    const payload = await response.json().catch(() => null) as
        | { token?: unknown; data?: { token?: unknown } }
        | null;

    const token = payload?.token ?? payload?.data?.token;
    return looksLikeJwt(token) ? token : null;
}

async function fetchAuthJwt(): Promise<string | null> {
    // Return cached token if still valid
    if (_cachedJwt && Date.now() < _cachedJwtExpiry) {
        return _cachedJwt;
    }

    // Deduplicate: if a request is already in flight, piggyback on it
    if (_inflight) {
        return _inflight;
    }

    const generation = _authGeneration;
    const request = _fetchAuthJwtOnce().then((token) => {
        if (generation !== _authGeneration) return null;
        _cachedJwt = token;
        _cachedJwtExpiry = token ? Date.now() + JWT_CACHE_TTL_MS : 0;
        return token;
    }).finally(() => {
        if (_inflight === request) _inflight = null;
    });
    _inflight = request;
    return request;
}

/** Invalidate the JWT cache — call after auth recovery or sign-out. */
export function clearAuthJwtCache(): void {
    _authGeneration++;
    _inflight = null;
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
        const generation = _authGeneration;
        // The shared JWT cache is the common path. Session/keyring reads are
        // fallbacks, not a prerequisite repeated before every API request.
        let token = await fetchAuthJwt();
        if (!token) {
            const [desktopSession, sessionResult] = await Promise.all([
                readDesktopAuthSession(),
                authClient.getSession(),
            ]);
            token = [desktopSession?.jwt, sessionResult?.data?.session?.token].find(looksLikeJwt) ?? null;
        }
        if (generation !== _authGeneration) token = null;

        if (!token) {
            console.warn("[cadence:api-auth] authenticated request has no usable JWT", {
                request: typeof input === "string"
                    ? input
                    : input instanceof URL
                        ? input.toString()
                        : input.url,
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

    const response = await platformFetch(input, { ...requestInit, headers });

    return response;
}

/**
 * The one typed Hono RPC client. `authenticatedFetch` reads the current JWT on
 * every call, so it never needs rebuilding when the session changes. Backend
 * routes mount under /api/v1/; `.api` is that subtree (`apiClient.api.tasks`).
 */
export const apiClient = {
    api: hc<AppType>(API_BASE_URL, {
        fetch: (input: RequestInfo | URL, requestInit?: RequestInit) =>
            authenticatedFetch(input, { ...requestInit, authenticated: true }),
    }).api.v1,
};

export type ApiClient = typeof apiClient;
