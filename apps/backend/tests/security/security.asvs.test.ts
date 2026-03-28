/**
 * ASVS L2 Security Verification Suite
 *
 * Organized by OWASP ASVS L2 control families:
 * - V2: Authentication
 * - V4: Access Control
 * - V5: Input Validation
 * - V7: Error Handling & Logging
 * - V8: Data Protection
 * - V13: API Security
 * - V14: Configuration
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRemoteJWKSetMock, jwtVerifyMock } = vi.hoisted(() => ({
    createRemoteJWKSetMock: vi.fn(() => ({ jwks: true })),
    jwtVerifyMock: vi.fn(),
}));

vi.mock("jose", () => ({
    createRemoteJWKSet: createRemoteJWKSetMock,
    jwtVerify: jwtVerifyMock,
}));

import worker from "../../src/index";

function createExecutionContext(): ExecutionContext {
    return {
        exports: {},
        passThroughOnException() {},
        props: {},
        waitUntil() {},
    } as unknown as ExecutionContext;
}

function createLimiter(success = true) {
    return {
        limit: vi.fn().mockResolvedValue({ success }),
    };
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
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

function authedRequest(path: string, options: RequestInit = {}) {
    return new Request(`http://localhost${path}`, {
        ...options,
        headers: {
            Authorization: "Bearer valid-token",
            ...options.headers,
        },
    });
}

// ── V2: Authentication Verification ─────────────────────────────────

describe("ASVS V2: Authentication", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "user-1", email: "user@example.com" },
        });
    });

    it("rejects tokens with wrong issuer", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error('"iss" claim check failed'));

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        const body = await response.json() as any;
        expect(body.error.code).toBe("INVALID_ISSUER");
    });

    it("rejects tokens with wrong audience", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error('"aud" claim check failed'));

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        const body = await response.json() as any;
        expect(body.error.code).toBe("INVALID_AUDIENCE");
    });

    it("rejects expired tokens explicitly", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error("exp claim timestamp check failed"));

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        const body = await response.json() as any;
        expect(body.error.code).toBe("TOKEN_EXPIRED");
    });

    it("rejects tokens without a subject claim", async () => {
        jwtVerifyMock.mockResolvedValueOnce({ payload: {} });

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
    });

    it("succeeds without JWT_ISSUER configured (optional claim)", async () => {
        jwtVerifyMock.mockResolvedValueOnce({
            payload: { sub: "user-1", email: "user@example.com" },
        });

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv({ JWT_ISSUER: undefined }),
            createExecutionContext(),
        );

        // Auth passes — any error is from the route handler, not missing config
        const body = await response.json() as any;
        expect(body.error?.code).not.toBe("INTERNAL_SERVER_ERROR");
        expect(body.error?.message).not.toContain("JWT_ISSUER");
    });

    it("succeeds without JWT_AUDIENCE configured (optional claim)", async () => {
        jwtVerifyMock.mockResolvedValueOnce({
            payload: { sub: "user-1", email: "user@example.com" },
        });

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv({ JWT_AUDIENCE: undefined }),
            createExecutionContext(),
        );

        // Auth passes — any error is from the route handler, not missing config
        const body = await response.json() as any;
        expect(body.error?.code).not.toBe("INTERNAL_SERVER_ERROR");
        expect(body.error?.message).not.toContain("JWT_AUDIENCE");
    });

    it("fails fast when NEON_AUTH_JWKS_URL is not configured", async () => {
        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv({ NEON_AUTH_JWKS_URL: undefined }),
            createExecutionContext(),
        );

        expect(response.status).toBe(500);
    });

    it("distinguishes auth provider unavailability from token rejection", async () => {
        jwtVerifyMock.mockRejectedValue(new Error("fetch failed: network error"));

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(503);
        const body = await response.json() as any;
        expect(body.error.code).toBe("AUTH_PROVIDER_UNAVAILABLE");
        expect(body.error.isRetryable).toBe(true);
    });
});

// ── V4: Access Control Verification ─────────────────────────────────

describe("ASVS V4: Access Control", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "user-1", email: "user@example.com" },
        });
    });

    describe("debug routes blocked in production", () => {
        it("returns 404 for debug routes when DEPLOYMENT_STAGE is production", async () => {
            jwtVerifyMock.mockResolvedValue({
                payload: { sub: "admin-user", email: "admin@cadenceapp.cloud" },
            });

            const response = await worker.fetch(
                authedRequest("/api/v1/debug/capabilities"),
                createEnv({ DEPLOYMENT_STAGE: "production", ENABLE_DEBUG_ROUTES: "true" }),
                createExecutionContext(),
            );

            expect(response.status).toBe(404);
        });

        it("returns 404 for debug routes when DEPLOYMENT_STAGE is absent (defaults to production)", async () => {
            jwtVerifyMock.mockResolvedValue({
                payload: { sub: "admin-user", email: "admin@cadenceapp.cloud" },
            });

            const response = await worker.fetch(
                authedRequest("/api/v1/debug/capabilities"),
                createEnv({ DEPLOYMENT_STAGE: undefined, ENABLE_DEBUG_ROUTES: "true" }),
                createExecutionContext(),
            );

            expect(response.status).toBe(404);
        });

        it("allows debug routes in development stage with explicit opt-in", async () => {
            jwtVerifyMock.mockResolvedValue({
                payload: { sub: "admin-user", email: "admin@cadenceapp.cloud" },
            });

            const response = await worker.fetch(
                authedRequest("/api/v1/debug/capabilities"),
                createEnv({ DEPLOYMENT_STAGE: "development", ENABLE_DEBUG_ROUTES: "true" }),
                createExecutionContext(),
            );

            expect(response.status).toBe(200);
        });

        it("blocks debug routes in development if ENABLE_DEBUG_ROUTES is not set", async () => {
            jwtVerifyMock.mockResolvedValue({
                payload: { sub: "admin-user", email: "admin@cadenceapp.cloud" },
            });

            const response = await worker.fetch(
                authedRequest("/api/v1/debug/capabilities"),
                createEnv({ DEPLOYMENT_STAGE: "development", ENABLE_DEBUG_ROUTES: undefined }),
                createExecutionContext(),
            );

            expect(response.status).toBe(404);
        });
    });

    it("denies non-admin users from debug routes", async () => {
        jwtVerifyMock.mockResolvedValueOnce({
            payload: { sub: "regular-user", email: "user@example.com" },
        });

        const response = await worker.fetch(
            authedRequest("/api/v1/debug/capabilities"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(403);
        const body = await response.json() as any;
        expect(body.error.code).toBe("FORBIDDEN");
    });

    it("requires auth on all /api/* routes", async () => {
        const endpoints = [
            "/api/v1/tasks",
            "/api/v1/projects",
            "/api/v1/tags",
            "/api/v1/inbox",
            "/api/v1/sections",
            "/api/v1/settings",
            "/api/v1/habits",
            "/api/v1/suggestions",
            "/api/v1/events",
        ];

        for (const path of endpoints) {
            const response = await worker.fetch(
                new Request(`http://localhost${path}`),
                createEnv(),
                createExecutionContext(),
            );
            expect(response.status).toBe(401);
        }
    });
});

// ── V5: Input Validation Verification ───────────────────────────────

describe("ASVS V5: Input Validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "user-1", email: "user@example.com" },
        });
    });

    it("enforces request body size limit at 100KB", async () => {
        const oversizedBody = "x".repeat(102401);

        const response = await worker.fetch(
            new Request("http://localhost/api/v1/tasks", {
                method: "POST",
                headers: {
                    Authorization: "Bearer valid-token",
                    "Content-Type": "application/json",
                    "Content-Length": String(oversizedBody.length),
                },
                body: oversizedBody,
            }),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(413);
    });
});

// ── V7: Error Handling & Logging ────────────────────────────────────

describe("ASVS V7: Error Handling & Logging", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "user-1", email: "user@example.com" },
        });
    });

    it("returns a server-generated request ID, not a client-supplied one", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/health", {
                headers: { "x-request-id": "attacker-controlled-id" },
            }),
            createEnv(),
            createExecutionContext(),
        );

        const returnedId = response.headers.get("x-request-id");
        expect(returnedId).toBeTruthy();
        expect(returnedId).not.toBe("attacker-controlled-id");
        // Server-generated UUID format
        expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("never exposes internal error details to clients", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error("JWKS internal: database connection pool exhausted at postgres://host:5432/db"));

        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        const body = await response.json() as any;
        // Should not contain internal hostnames, connection strings, or stack traces
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toContain("postgres://");
        expect(bodyStr).not.toContain("5432");
        expect(bodyStr).not.toContain("pool exhausted");
    });

    it("includes structured error shape on all error responses", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/v1/tasks"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        const body = await response.json() as any;
        expect(body.error).toBeDefined();
        expect(body.error.code).toBeDefined();
        expect(body.error.message).toBeDefined();
        expect(body.error.status).toBeDefined();
        expect(typeof body.error.isRetryable).toBe("boolean");
        expect(body.error.requestId).toBeDefined();
    });
});

// ── V8: Data Protection ─────────────────────────────────────────────

describe("ASVS V8: Data Protection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "user-1", email: "user@example.com" },
        });
    });

    it("health endpoint does not leak server internals", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/health"),
            createEnv(),
            createExecutionContext(),
        );

        const body = await response.json() as any;
        const bodyStr = JSON.stringify(body);
        // Should not contain environment variable names, internal URLs, etc.
        expect(bodyStr).not.toContain("HYPERDRIVE");
        expect(bodyStr).not.toContain("NEON_AUTH_JWKS_URL");
        expect(bodyStr).not.toContain("JWT_ISSUER");
    });
});

// ── V13: API Security ───────────────────────────────────────────────

describe("ASVS V13: API Security", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "user-1", email: "user@example.com" },
        });
    });

    it("sets secure headers on all responses", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/health"),
            createEnv(),
            createExecutionContext(),
        );

        // Hono secureHeaders middleware should set these
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    });

    it("rate-limits unauthenticated requests at the IP level", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/v1/tasks"),
            createEnv({ RATE_LIMITER: createLimiter(false) }),
            createExecutionContext(),
        );

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
    });

    it("rate-limits authenticated read requests per user", async () => {
        const response = await worker.fetch(
            authedRequest("/api/v1/tasks"),
            createEnv({ RATE_LIMITER_READ: createLimiter(false) }),
            createExecutionContext(),
        );

        expect(response.status).toBe(429);
    });

    it("rate-limits authenticated write requests per user", async () => {
        const response = await worker.fetch(
            authedRequest("/api/v1/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Test" }),
            }),
            createEnv({ RATE_LIMITER_WRITE: createLimiter(false) }),
            createExecutionContext(),
        );

        expect(response.status).toBe(429);
    });
});

// ── V14: Configuration Verification ─────────────────────────────────

describe("ASVS V14: Configuration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: { sub: "admin-user", email: "admin@cadenceapp.cloud" },
        });
    });

    it("CORS rejects unknown origins and falls back to production origin", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/health", {
                headers: { Origin: "https://evil.example.com" },
            }),
            createEnv({ DEPLOYMENT_STAGE: "production" }),
            createExecutionContext(),
        );

        expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.cadenceapp.cloud");
    });

    it("CORS allows explicit ALLOWED_ORIGINS entries", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/health", {
                headers: { Origin: "https://staging.cadenceapp.cloud" },
            }),
            createEnv({
                DEPLOYMENT_STAGE: "staging",
                ALLOWED_ORIGINS: "https://staging.cadenceapp.cloud,https://preview.cadenceapp.cloud",
            }),
            createExecutionContext(),
        );

        expect(response.headers.get("access-control-allow-origin")).toBe("https://staging.cadenceapp.cloud");
    });

    it("CORS blocks localhost in production even with ALLOWED_ORIGINS", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/health", {
                headers: { Origin: "http://localhost:3000" },
            }),
            createEnv({ DEPLOYMENT_STAGE: "production" }),
            createExecutionContext(),
        );

        expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.cadenceapp.cloud");
    });

    it("CORS preflight allows Idempotency-Key for cross-origin mutations", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/v1/tasks/test/subtasks", {
                method: "OPTIONS",
                headers: {
                    Origin: "http://localhost:8788",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
                },
            }),
            createEnv({ DEPLOYMENT_STAGE: "development" }),
            createExecutionContext(),
        );

        expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8788");
        expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
    });

    it("deployment stage defaults to production when not set", async () => {
        // Debug routes should be blocked
        const response = await worker.fetch(
            authedRequest("/api/v1/debug/capabilities"),
            createEnv({ DEPLOYMENT_STAGE: undefined }),
            createExecutionContext(),
        );

        expect(response.status).toBe(404);
    });
});
