import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import { ApiErrorResponse, networkError } from "../../types/api";
import { jwtExpiry, publishSessionExpiry, readFreshSession } from "../auth/session";
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
    const expiry = Math.min(jwtExpiry(token, userId), Date.now() + JWT_CACHE_TTL_MS);
    if (typeof token !== "string" || expiry <= Date.now()) return false;
    // A late /token response must not replace the seeded session.
    _inflight = null;
    _cachedJwt = token;
    _cachedJwtExpiry = expiry;
    startupMark("jwt.ready");
    return true;
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
    if (response.status === 429) throw networkError();
    if (!response.ok) {
        log.warn("api-auth", `/token request failed (${response.status})`);
        if (response.status !== 401 && response.status !== 403) throw networkError();
        return null;
    }

    const payload = await response.json().catch(() => null) as
        | { token?: unknown; data?: { token?: unknown } }
        | null;

    const token = payload?.token ?? payload?.data?.token;
    return typeof token === "string" && jwtExpiry(token) > Date.now() ? token : null;
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
    const request = (async () => {
        let token = await _fetchAuthJwtOnce();
        if (!token && generation === _authGeneration) {
            // get-session renews the cookie-backed session; /token alone does not.
            let result;
            try { result = await readFreshSession(); }
            catch (error) {
                if ((error as { status?: number })?.status !== 401) throw networkError();
            }
            const stored = await readDesktopAuthSession();
            token = [result?.data?.session?.token, stored?.jwt]
                .find((value): value is string => typeof value === "string" && jwtExpiry(value) > Date.now()) ?? null;
        }
        return token;
    })().then((token) => {
        if (generation !== _authGeneration) return null;
        if (_cachedJwt && Date.now() < _cachedJwtExpiry) return _cachedJwt;
        _cachedJwt = token;
        _cachedJwtExpiry = token ? Math.min(jwtExpiry(token), Date.now() + JWT_CACHE_TTL_MS) : 0;
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

/** Streams and uploads own their deadlines; everything else gets one. */
function isBounded(url: string, body: BodyInit | null | undefined) {
    return !(body instanceof FormData || body instanceof Blob) && !url.includes("/stream") && !url.includes("/ai/chat");
}

/** One call's request, as each send and token read needs it. */
interface Attempt {
    input: RequestInfo | URL;
    init: RequestInit;
    headers: Headers;
    callerSignal: AbortSignal | null | undefined;
    bounded: boolean;
    generation: number;
}

// Any rejection means no answer (the desktop transport rejects with its own errors),
// except a caller's own abort, like stopping an assistant reply.
function send(a: Attempt): Promise<Response> {
    return platformFetch(a.input instanceof Request ? a.input.clone() as typeof a.input : a.input, { ...a.init, headers: a.headers }).catch((error: unknown) => {
        if (a.callerSignal?.aborted) throw a.callerSignal.reason;
        throw error instanceof DOMException && error.name === "AbortError" && !a.bounded ? error : networkError();
    });
}

/** The JWT, unless the account changed, the caller left, or the deadline passed meanwhile. */
async function acquireToken(a: Attempt): Promise<string | null> {
    if (a.callerSignal?.aborted) throw a.callerSignal.reason;
    let token: string | null;
    try { token = await withSignal(fetchAuthJwt(), a.init.signal); }
    catch (error) {
        if (a.callerSignal?.aborted) throw a.callerSignal.reason;
        throw a.init.signal?.aborted ? networkError() : error;
    }
    if (a.generation !== _authGeneration) throw new DOMException("Account changed", "AbortError");
    if (a.callerSignal?.aborted) throw a.callerSignal.reason;
    if (a.init.signal?.aborted) throw networkError();
    return token;
}

/**
 * Retry an explicit auth rejection once, before any route work/stream began.
 * Concurrent rejections of the same token share the replacement request.
 */
async function retryUnauthorized(a: Attempt, response: Response): Promise<Response> {
    const rejected = a.headers.get("Authorization")?.slice(7);
    if (_cachedJwt === rejected) {
        _cachedJwt = null;
        _cachedJwtExpiry = 0;
    }
    const token = await acquireToken(a);
    if (token && token !== rejected && !(a.init.body instanceof ReadableStream)) {
        await response.body?.cancel();
        a.headers.set("Authorization", `Bearer ${token}`);
        response = await send(a);
    }
    if (response.status === 401 && a.generation === _authGeneration) publishSessionExpiry();
    return response;
}

/** Wait out a warm start's session check, start the deadline, then attach the JWT. */
async function authorize(a: Attempt, method: string): Promise<void> {
    if (sessionHold) {
        // Before the deadline starts: the wait is for the session, not this request.
        await withSignal(sessionHold.promise, a.callerSignal);
        if (a.generation !== _authGeneration) throw new DOMException("Account changed", "AbortError");
    }
    // Streams and uploads own their deadlines. Ordinary reads always retain a deadline.
    if (a.bounded) a.init.signal = a.callerSignal
        ? AbortSignal.any([a.callerSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    // The shared JWT cache is the common path. Session/keyring reads are
    // fallbacks, not a prerequisite repeated before every API request.
    const token = await acquireToken(a);
    if (!token) {
        publishSessionExpiry();
        throw new ApiErrorResponse({
            status: 401,
            code: "UNAUTHORIZED",
            message: "Authentication token is unavailable",
        });
    }
    a.headers.set("Authorization", `Bearer ${token}`);
    if (method.toUpperCase() === "GET") a.init.cache = "no-store";
}

export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: AuthenticatedFetchOptions = {},
): Promise<Response> {
    const { authenticated = false, ...requestInit } = init;
    const request = input instanceof Request ? input : undefined;
    const attempt: Attempt = {
        input,
        init: requestInit,
        headers: new Headers(requestInit.headers ?? request?.headers),
        callerSignal: requestInit.signal ?? request?.signal,
        bounded: authenticated && isBounded(request?.url ?? String(input), requestInit.body),
        generation: _authGeneration,
    };
    if (!authenticated) return send(attempt);

    await authorize(attempt, requestInit.method ?? request?.method ?? "GET");
    let response = await send(attempt);
    if (response.status === 401 && attempt.generation === _authGeneration) response = await retryUnauthorized(attempt, response);
    // A captive portal answers API calls with its own HTML page.
    if (response.headers.get("content-type")?.includes("text/html")) throw networkError();
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
