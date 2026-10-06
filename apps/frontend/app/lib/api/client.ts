import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import { ApiErrorResponse, networkError } from "../../types/api";
import { authClient } from "../auth-client";
import { readDesktopAuthSession } from "../desktop-auth-session";
import { API_BASE_URL, NEON_AUTH_URL } from "../env";
import { platformFetch } from "../../platform/runtime";
import { log } from "../log";
import { REQUEST_TIMEOUT_MS } from "./request-deadline";
import { startupMark, recordStartupRead, startupEndpoint, startupCollecting, type ReadDetails } from "../startup-timing";
import { errorCodeSchema } from "@cadence/contracts/common";
import { PERFORMANCE_CATEGORIES, type PerformanceSample } from "@cadence/contracts/events";

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
// Weak signal should fail fast so the write can be queued, not hang for a minute.

/** Cache only a live JWT for this account; the backend still verifies its signature. */
export function seedAuthJwtCache(token: unknown, userId: string): boolean {
    startupMark("jwt.start");
    if (!looksLikeJwt(token)) return false;
    try {
        const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(encoded));
        if (payload.sub !== userId || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return false;
        const expiry = Math.min(payload.exp * 1000 - 5_000, Date.now() + JWT_CACHE_TTL_MS);
        if (expiry <= Date.now()) return false;
        // A late /token response must not replace the seeded session.
        _inflight = null;
        _cachedJwt = token;
        _cachedJwtExpiry = expiry;
        startupMark("jwt.ready");
        return true;
    } catch { return false; }
}

async function _fetchAuthJwtOnce(): Promise<string | null> {
    startupMark("jwt.start");
    const response = await fetch(`${NEON_AUTH_URL}/token`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => null);

    // No answer, the auth service is down, or a captive portal's page: that says
    // nothing about the session.
    if (!response || response.status >= 500 || response.headers.get("content-type")?.includes("text/html")) {
        log.warn("api-auth", `/token request failed (${response?.status ?? "network"})`);
        throw networkError();
    }
    if (!response.ok) {
        log.warn("api-auth", `/token request failed (${response.status})`);
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
        if (_cachedJwt && Date.now() < _cachedJwtExpiry) return _cachedJwt;
        _cachedJwt = token;
        _cachedJwtExpiry = token ? Date.now() + JWT_CACHE_TTL_MS : 0;
        if (token) startupMark("jwt.ready");
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

// While a warm start shows the saved workspace ahead of the session check, API calls
// wait here. The real session releases them (an account change aborts them instead).
let sessionHold: ReturnType<typeof Promise.withResolvers<void>> | null = null;
export function holdForSession(): void {
    sessionHold ??= Promise.withResolvers<void>();
}
export function releaseSessionHold(): void {
    sessionHold?.resolve();
    sessionHold = null;
}
/** True while the session check hasn't answered a provisional (warm) start. */
export const isSessionHeld = () => sessionHold !== null;

/** Cancelling one caller must not cancel the token request shared by other reads. */
function withSignal<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (!signal) return work;
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
}

export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: AuthenticatedFetchOptions = {},
): Promise<Response> {
    const { authenticated = false, ...requestInit } = init;
    const headers = new Headers(requestInit.headers);
    const callerSignal = requestInit.signal;
    const heldGeneration = _authGeneration;
    if (authenticated && sessionHold) {
        // Before the deadline starts: the wait is for the session, not this request.
        await withSignal(sessionHold.promise, callerSignal);
        if (heldGeneration !== _authGeneration) throw new DOMException("Account changed", "AbortError");
    }
    // Streams and uploads own their deadlines. Ordinary reads always retain a deadline.
    const requestUrl = String(input instanceof Request ? input.url : input);
    const bounded = authenticated && !(requestInit.body instanceof FormData || requestInit.body instanceof Blob)
        && !requestUrl.includes("/stream") && !requestUrl.includes("/ai/chat");
    if (bounded) requestInit.signal = callerSignal
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    if (authenticated) {
        const generation = _authGeneration;
        // The shared JWT cache is the common path. Session/keyring reads are
        // fallbacks, not a prerequisite repeated before every API request.
        if (callerSignal?.aborted) throw callerSignal.reason;
        let token: string | null;
        try {
            token = await withSignal(fetchAuthJwt(), requestInit.signal);
            if (!token) {
                const [desktopSession, sessionResult] = await withSignal(Promise.all([
                    readDesktopAuthSession(),
                    authClient.getSession(),
                ]), requestInit.signal);
                token = [desktopSession?.jwt, sessionResult?.data?.session?.token].find(looksLikeJwt) ?? null;
            }
        } catch (error) {
            if (callerSignal?.aborted) throw callerSignal.reason;
            throw requestInit.signal?.aborted ? networkError() : error;
        }
        if (generation !== _authGeneration) throw new DOMException("Account changed", "AbortError");
        if (callerSignal?.aborted) throw callerSignal.reason;
        if (requestInit.signal?.aborted) throw networkError();

        if (!token) {
            log.warn("api-auth", "authenticated request has no usable JWT", input instanceof Request ? input.url : String(input));
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

    // Any rejection means no answer (the desktop transport rejects with its own errors),
    // except a caller's own abort, like stopping an assistant reply.
    const response = await platformFetch(input, { ...requestInit, headers }).catch((error: unknown) => {
        throw callerSignal?.aborted ? callerSignal.reason : error instanceof DOMException && error.name === "AbortError" && !bounded ? error : networkError();
    });
    // A captive portal answers API calls with its own HTML page.
    if (authenticated && response.headers.get("content-type")?.includes("text/html")) throw networkError();

    return response;
}

/**
 * The one typed Hono RPC client. `authenticatedFetch` reads the current JWT on
 * every call, so it never needs rebuilding when the session changes. Backend
 * routes mount under /api/v1/; `.api` is that subtree (`apiClient.api.tasks`).
 */
export const apiClient = {
    api: hc<AppType>(API_BASE_URL, {
        fetch: async (input: RequestInfo | URL, requestInit?: RequestInit) => {
            const start = performance.now();
            const generation = _authGeneration;
            const url = new URL(input instanceof Request ? input.url : String(input), API_BASE_URL);
            const endpoint = startupEndpoint(url);
            const domain = url.pathname.split("/")[3];
            const category: PerformanceSample["category"] = (PERFORMANCE_CATEGORIES as readonly string[]).includes(domain)
                ? domain as PerformanceSample["category"] : "other";
            const measured = (requestInit?.method ?? "GET") === "GET";
            const record = (from: number, outcome: PerformanceSample["outcome"], details: ReadDetails, phase?: "api_body") => {
                if (measured && generation === _authGeneration) recordStartupRead(category, from, outcome, { endpoint, ...details }, phase);
            };
            try {
                const response = await authenticatedFetch(input, { ...requestInit, authenticated: true });
                // A capability probe's 403/404 is an expected "no", not a failed read.
                const expected = response.ok || (endpoint === "debug_capabilities" && (response.status === 403 || response.status === 404));
                record(start, expected ? "ready" : "error", { status: response.status });
                // Measure only the body's normal consumption; never clone/drain it or delay headers.
                if (measured && startupCollecting()) {
                    const json = response.json.bind(response);
                    response.json = async () => {
                        const bodyStart = performance.now();
                        try {
                            const body = await json();
                            const code = response.ok ? undefined : errorCodeSchema.safeParse((body as { error?: { code?: unknown } } | null)?.error?.code);
                            record(bodyStart, response.ok ? "ready" : "error", { status: response.status, ...(code?.success ? { error_code: code.data } : {}) }, "api_body");
                            return body;
                        } catch (error) {
                            record(bodyStart, "error", { status: response.status }, "api_body");
                            throw error;
                        }
                    };
                }
                return response;
            } catch (error) {
                const code = error instanceof ApiErrorResponse ? error.code : undefined;
                record(start, code === "NETWORK_UNAVAILABLE" ? "network_unavailable" : "error", code ? { error_code: code } : {});
                throw error;
            }
        },
    }).api.v1,
};

export type ApiClient = typeof apiClient;
