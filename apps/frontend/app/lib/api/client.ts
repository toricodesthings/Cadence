import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import { ApiErrorResponse, networkError } from "../../types/api";
import { jwtExpiry, publishSessionExpiry, readFreshSession } from "../auth/session";
import { readDesktopAuthSession } from "../desktop-auth-session";
import { API_BASE_URL, NEON_AUTH_URL } from "../env";
import { platformFetch } from "../../platform/runtime";
import { log } from "../log";
import { REQUEST_TIMEOUT_MS } from "./request-deadline";
import {
    startupMark,
    recordStartupRead,
    startupEndpoint,
    startupCollecting,
    type ReadDetails,
} from "../startup-timing";
import { errorCodeSchema } from "@cadence/contracts/common";
import { PERFORMANCE_CATEGORIES, type PerformanceSample } from "@cadence/contracts/events";

export const PAGE_ORIGIN = crypto.randomUUID();

export interface AuthenticatedFetchOptions extends RequestInit {
    authenticated?: boolean;
}

let _cachedJwt: string | null = null;
let _cachedJwtExpiry = 0;
let _inflight: Promise<string | null> | null = null;
let _authGeneration = 0;
const JWT_CACHE_TTL_MS = 55_000;

export function seedAuthJwtCache(token: unknown, userId: string): boolean {
    startupMark("jwt.start");
    const expiry = Math.min(jwtExpiry(token, userId), Date.now() + JWT_CACHE_TTL_MS);
    if (typeof token !== "string" || expiry <= Date.now()) return false;
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

    const payload = (await response.json().catch(() => null)) as { token?: unknown; data?: { token?: unknown } } | null;

    const token = payload?.token ?? payload?.data?.token;
    return typeof token === "string" && jwtExpiry(token) > Date.now() ? token : null;
}

export const getAuthJwt = () => fetchAuthJwt();

export function dropAuthJwt(token: string): void {
    if (_cachedJwt === token) {
        _cachedJwt = null;
        _cachedJwtExpiry = 0;
    }
}

async function fetchAuthJwt(): Promise<string | null> {
    if (_cachedJwt && Date.now() < _cachedJwtExpiry) {
        return _cachedJwt;
    }

    if (_inflight) {
        return _inflight;
    }

    const generation = _authGeneration;
    const request = (async () => {
        let token = await _fetchAuthJwtOnce();
        if (!token && generation === _authGeneration) {
            let result;
            try {
                result = await readFreshSession();
            } catch (error) {
                if ((error as { status?: number })?.status !== 401) throw networkError();
            }
            const stored = await readDesktopAuthSession();
            token =
                [result?.data?.session?.token, stored?.jwt].find(
                    (value): value is string => typeof value === "string" && jwtExpiry(value) > Date.now(),
                ) ?? null;
        }
        return token;
    })()
        .then((token) => {
            if (generation !== _authGeneration) return null;
            if (_cachedJwt && Date.now() < _cachedJwtExpiry) return _cachedJwt;
            _cachedJwt = token;
            _cachedJwtExpiry = token ? Math.min(jwtExpiry(token), Date.now() + JWT_CACHE_TTL_MS) : 0;
            if (token) startupMark("jwt.ready");
            return token;
        })
        .finally(() => {
            if (_inflight === request) _inflight = null;
        });
    _inflight = request;
    return request;
}

export function clearAuthJwtCache(): void {
    _authGeneration++;
    _inflight = null;
    _cachedJwt = null;
    _cachedJwtExpiry = 0;
}

let sessionHold: ReturnType<typeof Promise.withResolvers<void>> | null = null;
export function holdForSession(): void {
    sessionHold ??= Promise.withResolvers<void>();
}
export function releaseSessionHold(): void {
    sessionHold?.resolve();
    sessionHold = null;
}
export const isSessionHeld = () => sessionHold !== null;

function withSignal<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (!signal) return work;
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
}

function isBounded(url: string, body: BodyInit | null | undefined) {
    return !(body instanceof FormData || body instanceof Blob) && !url.includes("/stream") && !url.includes("/ai/chat");
}

interface Attempt {
    input: RequestInfo | URL;
    init: RequestInit;
    headers: Headers;
    callerSignal: AbortSignal | null | undefined;
    bounded: boolean;
    generation: number;
}

function send(a: Attempt): Promise<Response> {
    return platformFetch(a.input instanceof Request ? (a.input.clone() as typeof a.input) : a.input, {
        ...a.init,
        headers: a.headers,
    }).catch((error: unknown) => {
        if (a.callerSignal?.aborted) throw a.callerSignal.reason;
        throw error instanceof DOMException && error.name === "AbortError" && !a.bounded ? error : networkError();
    });
}

async function acquireToken(a: Attempt): Promise<string | null> {
    if (a.callerSignal?.aborted) throw a.callerSignal.reason;
    let token: string | null;
    try {
        token = await withSignal(fetchAuthJwt(), a.init.signal);
    } catch (error) {
        if (a.callerSignal?.aborted) throw a.callerSignal.reason;
        throw a.init.signal?.aborted ? networkError() : error;
    }
    if (a.generation !== _authGeneration) throw new DOMException("Account changed", "AbortError");
    if (a.callerSignal?.aborted) throw a.callerSignal.reason;
    if (a.init.signal?.aborted) throw networkError();
    return token;
}

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

async function authorize(a: Attempt, method: string): Promise<void> {
    if (sessionHold) {
        await withSignal(sessionHold.promise, a.callerSignal);
        if (a.generation !== _authGeneration) throw new DOMException("Account changed", "AbortError");
    }
    if (a.bounded)
        a.init.signal = a.callerSignal
            ? AbortSignal.any([a.callerSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
            : AbortSignal.timeout(REQUEST_TIMEOUT_MS);

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
    a.headers.set("X-Cadence-Origin", PAGE_ORIGIN);
    if (method.toUpperCase() === "GET") a.init.cache = "no-store";
}

function attemptFor(
    input: RequestInfo | URL,
    request: Request | undefined,
    requestInit: RequestInit,
    authenticated: boolean,
): Attempt {
    return {
        input,
        init: requestInit,
        headers: new Headers(requestInit.headers ?? request?.headers),
        callerSignal: requestInit.signal ?? request?.signal,
        bounded: authenticated && isBounded(request?.url ?? String(input), requestInit.body),
        generation: _authGeneration,
    };
}

export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: AuthenticatedFetchOptions = {},
): Promise<Response> {
    const { authenticated = false, ...requestInit } = init;
    const request = input instanceof Request ? input : undefined;
    const attempt = attemptFor(input, request, requestInit, authenticated);
    if (!authenticated) return send(attempt);

    await authorize(attempt, requestInit.method ?? request?.method ?? "GET");
    let response = await send(attempt);
    if (response.status === 401 && attempt.generation === _authGeneration)
        response = await retryUnauthorized(attempt, response);
    if (response.headers.get("content-type")?.includes("text/html")) throw networkError();
    return response;
}

export const apiClient = {
    api: hc<AppType>(API_BASE_URL, {
        fetch: async (input: RequestInfo | URL, requestInit?: RequestInit) => {
            const start = performance.now();
            const generation = _authGeneration;
            const url = new URL(input instanceof Request ? input.url : String(input), API_BASE_URL);
            const endpoint = startupEndpoint(url);
            const domain = url.pathname.split("/")[3];
            const category: PerformanceSample["category"] = (PERFORMANCE_CATEGORIES as readonly string[]).includes(
                domain,
            )
                ? (domain as PerformanceSample["category"])
                : "other";
            const measured = (requestInit?.method ?? "GET") === "GET";
            const record = (
                from: number,
                outcome: PerformanceSample["outcome"],
                details: ReadDetails,
                phase?: "api_body",
            ) => {
                if (measured && generation === _authGeneration)
                    recordStartupRead(category, from, outcome, { endpoint, ...details }, phase);
            };
            try {
                const response = await authenticatedFetch(input, { ...requestInit, authenticated: true });
                const expected =
                    response.ok ||
                    (endpoint === "debug_capabilities" && (response.status === 403 || response.status === 404));
                record(start, expected ? "ready" : "error", { status: response.status });
                if (measured && startupCollecting()) {
                    const json = response.json.bind(response);
                    response.json = async () => {
                        const bodyStart = performance.now();
                        try {
                            const body = await json();
                            const code = response.ok
                                ? undefined
                                : errorCodeSchema.safeParse(
                                      (body as { error?: { code?: unknown } } | null)?.error?.code,
                                  );
                            record(
                                bodyStart,
                                response.ok ? "ready" : "error",
                                { status: response.status, ...(code?.success ? { error_code: code.data } : {}) },
                                "api_body",
                            );
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
                record(
                    start,
                    code === "NETWORK_UNAVAILABLE" ? "network_unavailable" : "error",
                    code ? { error_code: code } : {},
                );
                throw error;
            }
        },
    }).api.v1,
};

export type ApiClient = typeof apiClient;
