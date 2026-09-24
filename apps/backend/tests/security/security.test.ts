/**
 * The full worker middleware chain, driven through `worker.fetch` exactly as
 * Cloudflare calls it: request context → secure headers → body limit → CORS →
 * debug guard → IP limiter → JWT auth → user limiters → admin gate.
 *
 * `GET /api/v1/ai/usage` is the "auth passed" probe: it answers 200 with no
 * database or Redis configured, so any non-200 comes from the middleware.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authedRequest, createEnv, createExecutionContext } from "../helpers/app";

const { jwtVerifyMock } = vi.hoisted(() => ({ jwtVerifyMock: vi.fn() }));

vi.mock("jose", () => ({
    createRemoteJWKSet: vi.fn(() => ({ jwks: true })),
    jwtVerify: jwtVerifyMock,
}));

import worker from "../../src/index";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DASHBOARD_ORIGIN = "https://dashboard.cadenceapp.cloud";
const USAGE = "/api/v1/ai/usage";
const DEBUG = "/api/v1/debug/capabilities";

const ADMIN = { sub: "admin-user", email: "admin@cadenceapp.cloud" };
const MEMBER = { sub: "member-user", email: "member@example.com" };

function send(request: Request, env: Record<string, unknown> = {}) {
    return worker.fetch(request, createEnv(env), createExecutionContext());
}

function limiter(success: boolean) {
    return { limit: vi.fn().mockResolvedValue({ success }) };
}

beforeEach(() => {
    jwtVerifyMock.mockReset();
    jwtVerifyMock.mockResolvedValue({ payload: ADMIN });
});

describe("authentication", () => {
    it("rejects a request with no bearer token without trying to verify one", async () => {
        const response = await send(new Request(`http://localhost${USAGE}`));

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED", message: "Missing token" } });
        expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it.each([
        { verifierError: "signature verification failed", status: 401, code: "UNAUTHORIZED" },
        { verifierError: "exp claim timestamp check failed", status: 401, code: "TOKEN_EXPIRED" },
        { verifierError: '"iss" claim check failed', status: 401, code: "INVALID_ISSUER" },
        { verifierError: '"aud" claim check failed', status: 401, code: "INVALID_AUDIENCE" },
        { verifierError: "fetch failed: network error", status: 503, code: "AUTH_PROVIDER_UNAVAILABLE" },
    ])("maps verifier error '$verifierError' to $status $code", async ({ verifierError, status, code }) => {
        // Persistent, not Once: transient provider failures are retried before giving up.
        jwtVerifyMock.mockRejectedValue(new Error(verifierError));

        const response = await send(authedRequest(USAGE));

        expect(response.status).toBe(status);
        expect((await response.json() as any).error.code).toBe(code);
    });

    it("marks an unreachable auth provider as retryable", async () => {
        jwtVerifyMock.mockRejectedValue(new Error("fetch failed: network error"));

        const body = await (await send(authedRequest(USAGE))).json() as any;

        expect(body.error.isRetryable).toBe(true);
    });

    it("rejects a verified token that has no subject claim", async () => {
        jwtVerifyMock.mockResolvedValueOnce({ payload: {} });

        expect((await send(authedRequest(USAGE))).status).toBe(401);
    });

    it.each([
        { stage: "development", missing: "JWT_ISSUER", status: 200 },
        { stage: "development", missing: "JWT_AUDIENCE", status: 200 },
        { stage: "staging", missing: "JWT_AUDIENCE", status: 200 },
        { stage: "production", missing: "JWT_ISSUER", status: 500 },
        { stage: undefined, missing: "JWT_ISSUER", status: 500 },
    ])("with $missing unset in stage $stage, answers $status", async ({ stage, missing, status }) => {
        const response = await send(authedRequest(USAGE), { DEPLOYMENT_STAGE: stage, [missing]: undefined });

        expect(response.status).toBe(status);
        if (status === 500) expect((await response.json() as any).error.code).toBe("AUTH_MISCONFIGURED");
    });

    it("fails with 500 when NEON_AUTH_JWKS_URL is not configured", async () => {
        expect((await send(authedRequest(USAGE), { NEON_AUTH_JWKS_URL: undefined })).status).toBe(500);
    });

    it("never echoes internal error details back to the client", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error("JWKS internal: pool exhausted at postgres://host:5432/db"));

        const text = await (await send(authedRequest(USAGE))).text();

        expect(text).not.toContain("postgres://");
        expect(text).not.toContain("pool exhausted");
    });
});

describe("every route family requires auth", () => {
    it.each([
        ["GET", "/api/v1/tasks"],
        ["GET", "/api/v1/projects"],
        ["POST", "/api/v1/projects"],
        ["GET", "/api/v1/tags"],
        ["POST", "/api/v1/tags"],
        ["GET", "/api/v1/inbox"],
        ["POST", "/api/v1/inbox"],
        ["GET", "/api/v1/sections"],
        ["POST", "/api/v1/sections"],
        ["GET", "/api/v1/tasks/fake-id/subtasks"],
        ["GET", "/api/v1/suggestions"],
        ["POST", "/api/v1/events"],
        ["GET", "/api/v1/settings"],
        ["GET", "/api/v1/habits"],
        ["GET", "/api/v1/ai/usage"],
    ])("%s %s answers 401 with the standard error envelope", async (method, path) => {
        const response = await send(new Request(`http://localhost${path}`, { method }));

        expect(response.status).toBe(401);
        const { error } = await response.json() as any;
        expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401, isRetryable: false });
        expect(error.message).toEqual(expect.any(String));
        expect(error.requestId).toMatch(UUID);
    });
});

describe("debug routes", () => {
    it.each([
        { stage: "development", flag: "true", status: 200 },
        { stage: "development", flag: undefined, status: 404 },
        { stage: "production", flag: "true", status: 404 },
        { stage: "staging", flag: "true", status: 200 },
        { stage: undefined, flag: "true", status: 404 },
    ])("stage $stage with ENABLE_DEBUG_ROUTES=$flag answers $status to an admin", async ({ stage, flag, status }) => {
        const response = await send(authedRequest(DEBUG), { DEPLOYMENT_STAGE: stage, ENABLE_DEBUG_ROUTES: flag });

        expect(response.status).toBe(status);
    });

    it("still requires a token when enabled", async () => {
        expect((await send(new Request(`http://localhost${DEBUG}`))).status).toBe(401);
    });

    it("forbids a valid non-admin user", async () => {
        jwtVerifyMock.mockResolvedValueOnce({ payload: MEMBER });

        const response = await send(authedRequest(DEBUG));

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN", message: "Admin access required" } });
    });
});

describe("rate limiting", () => {
    it("applies the IP limiter before auth", async () => {
        const response = await send(new Request(`http://localhost${USAGE}`), { RATE_LIMITER: limiter(false) });

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it("applies the per-user read limiter after auth", async () => {
        const response = await send(authedRequest(USAGE), { RATE_LIMITER_READ: limiter(false) });

        expect(response.status).toBe(429);
        expect((await response.json() as any).error.code).toBe("TOO_MANY_REQUESTS");
        expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["/api/v1/projects", { name: "Test" }],
        ["/api/v1/inbox", { rawText: "Test" }],
    ])("applies the per-user write limiter to POST %s", async (path, body) => {
        const request = authedRequest(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const response = await send(request, { RATE_LIMITER_WRITE: limiter(false) });

        expect(response.status).toBe(429);
        expect((await response.json() as any).error.code).toBe("TOO_MANY_REQUESTS");
    });
});

describe("request handling", () => {
    it("rejects a body over 100KB with 413", async () => {
        const body = "x".repeat(102_401);
        const request = authedRequest("/api/v1/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": String(body.length) },
            body,
        });

        expect((await send(request)).status).toBe(413);
    });

    it("issues its own request id and ignores a client-supplied one", async () => {
        const response = await send(new Request("http://localhost/health", { headers: { "x-request-id": "attacker-id" } }));

        expect(response.headers.get("x-request-id")).toMatch(UUID);
    });

    it("sets secure headers", async () => {
        const response = await send(new Request("http://localhost/health"));

        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    });
});

describe("CORS", () => {
    it.each([
        { stage: "development", origin: "http://localhost:8788", allowed: undefined, expected: "http://localhost:8788" },
        { stage: "development", origin: "https://evil.example.com", allowed: undefined, expected: DASHBOARD_ORIGIN },
        { stage: "production", origin: "http://localhost:8788", allowed: undefined, expected: DASHBOARD_ORIGIN },
        { stage: "production", origin: "https://evil.example.com", allowed: undefined, expected: DASHBOARD_ORIGIN },
        {
            stage: "staging",
            origin: "https://staging.cadenceapp.cloud",
            allowed: "https://staging.cadenceapp.cloud,https://preview.cadenceapp.cloud",
            expected: "https://staging.cadenceapp.cloud",
        },
    ])("in $stage, origin $origin is answered with $expected", async ({ stage, origin, allowed, expected }) => {
        const response = await send(new Request("http://localhost/health", { headers: { Origin: origin } }), {
            DEPLOYMENT_STAGE: stage,
            ALLOWED_ORIGINS: allowed,
        });

        expect(response.headers.get("access-control-allow-origin")).toBe(expected);
    });

    it("exposes Retry-After so the client can wait out a 429", async () => {
        const response = await send(new Request("http://localhost/health", { headers: { Origin: "http://localhost:8788" } }));

        expect(response.headers.get("access-control-expose-headers")).toBe("Retry-After");
    });

    it("lets preflight requests send Idempotency-Key", async () => {
        const request = new Request("http://localhost/api/v1/tasks/test/subtasks", {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:8788",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
            },
        });

        const response = await send(request);

        expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
        // Browsers cache the preflight instead of re-asking before every request.
        expect(response.headers.get("access-control-max-age")).toBe("7200");
    });
});
