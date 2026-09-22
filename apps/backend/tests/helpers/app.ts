import { vi } from "vitest";
import { Hono } from "hono";
import type { Hono as HonoApp } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Mounts a domain router behind the same error handler + request-context
 * middleware the real app uses, with a fixed authenticated `userId` standing
 * in for the auth middleware's output. Shared by every route contract/
 * integration test so the pipeline setup lives in one place.
 */
export function createTestApp(mountPath: string, routes: HonoApp<any>, userId: string = TEST_USER_ID) {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError((err, c) => {
        const res = formatErrorResponse(err);
        return c.json(res.body, res.status as 500);
    });
    app.use("*", createRequestContext());
    app.use("*", async (c, next) => {
        c.set("userId", userId);
        await next();
    });
    app.route(mountPath, routes as any);
    return app;
}

/** Cloudflare Workers ExecutionContext stub for `worker.fetch(...)` calls. */
export function createExecutionContext(): ExecutionContext {
    return {
        exports: {},
        passThroughOnException() {},
        props: {},
        waitUntil() {},
    } as unknown as ExecutionContext;
}

function createLimiter(success = true) {
    return { limit: vi.fn().mockResolvedValue({ success }) };
}

/** Worker env stub used by the top-level `worker.fetch` security/middleware tests. */
export function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        HYPERDRIVE: {},
        NEON_AUTH_JWKS_URL: "https://auth.cadenceapp.cloud/jwks.json",
        JWT_ISSUER: "https://auth.cadenceapp.cloud",
        JWT_AUDIENCE: "cadence-api",
        DEPLOYMENT_STAGE: "development",
        ENABLE_DEBUG_ROUTES: "true",
        RATE_LIMITER: createLimiter(),
        RATE_LIMITER_READ: createLimiter(),
        RATE_LIMITER_WRITE: createLimiter(),
        RATE_LIMITER_ADMIN: createLimiter(),
        ADMIN_USER_IDS: "admin-user",
        ADMIN_EMAILS: "admin@cadenceapp.cloud",
        ...overrides,
    } as any;
}

/** A Request pre-populated with a bearer token, for `worker.fetch` tests. */
export function authedRequest(path: string, options: RequestInit = {}) {
    return new Request(`http://localhost${path}`, {
        ...options,
        headers: {
            Authorization: "Bearer valid-token",
            ...options.headers,
        },
    });
}

/**
 * A JSON client for one router, acting as `userId`. Awaits every `waitUntil`
 * task before returning, so background writes (metrics, usage events) are
 * visible to the next assertion.
 */
export function apiAs(userId: string, mountPath: string, routes: HonoApp<any>, env: Record<string, unknown> = {}) {
    const app = createTestApp(mountPath, routes, userId);
    return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
        const pending: Promise<unknown>[] = [];
        const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
        const response = await app.request(
            `http://localhost${mountPath}${path}`,
            {
                method,
                headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            env,
            ctx as unknown as ExecutionContext,
        );
        await Promise.all(pending);
        const isJson = response.headers.get("content-type")?.includes("json");
        const json = isJson ? await response.json() : undefined;
        assertIsoTimestamps(json);
        return { status: response.status, body: json as any, response };
    };
}

const LOOKS_LIKE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const STRICT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * API invariant, checked on every integration response: date-times go out in one
 * format, strict ISO ("2026-03-09T12:00:00.000Z"), never Postgres text
 * ("2026-03-09 12:00:00+00"), so clients can echo any value back unchanged.
 */
function assertIsoTimestamps(value: unknown, path = "body") {
    if (typeof value === "string") {
        if (LOOKS_LIKE_DATETIME.test(value) && !STRICT_ISO.test(value)) {
            throw new Error(`Non-ISO timestamp at ${path}: ${JSON.stringify(value)}`);
        }
    } else if (Array.isArray(value)) {
        value.forEach((item, i) => assertIsoTimestamps(item, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) assertIsoTimestamps(item, `${path}.${key}`);
    }
}
