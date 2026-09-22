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
