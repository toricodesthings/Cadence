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

describe("backend middleware security", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jwtVerifyMock.mockResolvedValue({
            payload: {
                sub: "admin-user",
                email: "admin@cadenceapp.cloud",
            },
        });
    });

    it("allows localhost origins and pins unknown origins to the production dashboard origin", async () => {
        const localhostResponse = await worker.fetch(
            new Request("http://localhost/health", {
                headers: {
                    Origin: "http://localhost:8788",
                },
            }),
            createEnv(),
            createExecutionContext(),
        );

        const foreignResponse = await worker.fetch(
            new Request("http://localhost/health", {
                headers: {
                    Origin: "https://evil.example.com",
                },
            }),
            createEnv(),
            createExecutionContext(),
        );

        expect(localhostResponse.headers.get("access-control-allow-origin")).toBe("http://localhost:8788");
        expect(foreignResponse.headers.get("access-control-allow-origin")).toBe("https://dashboard.cadenceapp.cloud");
    });

    it("rejects missing bearer tokens with a structured 401", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities"),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "UNAUTHORIZED",
                message: "Missing token",
            },
        });
        expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it("rejects malformed bearer tokens", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error("signature verification failed"));

        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities", {
                headers: {
                    Authorization: "Bearer malformed-token",
                },
            }),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "UNAUTHORIZED",
                message: "Invalid token",
            },
        });
    });

    it("surfaces expired bearer tokens explicitly", async () => {
        jwtVerifyMock.mockRejectedValueOnce(new Error("exp claim timestamp check failed"));

        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities", {
                headers: {
                    Authorization: "Bearer expired-token",
                },
            }),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "TOKEN_EXPIRED",
                message: "Session expired",
            },
        });
    });

    it("applies the global IP limiter before auth", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/tasks"),
            createEnv({
                RATE_LIMITER: createLimiter(false),
            }),
            createExecutionContext(),
        );

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it("applies the user-scoped read limiter after auth", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities", {
                headers: {
                    Authorization: "Bearer valid-token",
                },
            }),
            createEnv({
                RATE_LIMITER_READ: createLimiter(false),
            }),
            createExecutionContext(),
        );

        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "TOO_MANY_REQUESTS",
            },
        });
        expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
    });

    it("denies non-admin users from debug capabilities even with a valid token", async () => {
        jwtVerifyMock.mockResolvedValueOnce({
            payload: {
                sub: "member-user",
                email: "member@example.com",
            },
        });

        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities", {
                headers: {
                    Authorization: "Bearer valid-token",
                },
            }),
            createEnv({
                ADMIN_USER_IDS: "another-admin",
                ADMIN_EMAILS: "another-admin@example.com",
            }),
            createExecutionContext(),
        );

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "FORBIDDEN",
                message: "Admin access required",
            },
        });
    });

    describe("auth required for all route families", () => {
        const protectedEndpoints = [
            { name: "projects (GET)", method: "GET", path: "/api/projects" },
            { name: "projects (POST)", method: "POST", path: "/api/projects" },
            { name: "tags (GET)", method: "GET", path: "/api/tags" },
            { name: "tags (POST)", method: "POST", path: "/api/tags" },
            { name: "inbox (GET)", method: "GET", path: "/api/inbox" },
            { name: "inbox (POST)", method: "POST", path: "/api/inbox" },
            { name: "sections (GET)", method: "GET", path: "/api/sections" },
            { name: "sections (POST)", method: "POST", path: "/api/sections" },
            { name: "subtasks (GET)", method: "GET", path: "/api/tasks/fake-id/subtasks" },
            { name: "suggestions (GET)", method: "GET", path: "/api/suggestions" },
            { name: "events (POST)", method: "POST", path: "/api/events" },
            { name: "settings (GET)", method: "GET", path: "/api/settings" },
            { name: "tasks (GET)", method: "GET", path: "/api/tasks" },
            { name: "habits (GET)", method: "GET", path: "/api/habits" },
        ];

        for (const { name, method, path } of protectedEndpoints) {
            it(`rejects unauthenticated ${name} requests with 401`, async () => {
                const response = await worker.fetch(
                    new Request(`http://localhost${path}`, { method }),
                    createEnv(),
                    createExecutionContext(),
                );

                expect(response.status).toBe(401);
                await expect(response.json()).resolves.toMatchObject({
                    error: { code: "UNAUTHORIZED" },
                });
            });
        }
    });

    describe("write rate limiter applied on mutations", () => {
        it("rate-limits POST to /api/projects when write limiter is exhausted", async () => {
            const response = await worker.fetch(
                new Request("http://localhost/api/projects", {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer valid-token",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ name: "Test" }),
                }),
                createEnv({
                    RATE_LIMITER_WRITE: createLimiter(false),
                }),
                createExecutionContext(),
            );

            expect(response.status).toBe(429);
            await expect(response.json()).resolves.toMatchObject({
                error: { code: "TOO_MANY_REQUESTS" },
            });
        });

        it("rate-limits POST to /api/inbox when write limiter is exhausted", async () => {
            const response = await worker.fetch(
                new Request("http://localhost/api/inbox", {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer valid-token",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ rawText: "Test" }),
                }),
                createEnv({
                    RATE_LIMITER_WRITE: createLimiter(false),
                }),
                createExecutionContext(),
            );

            expect(response.status).toBe(429);
        });
    });
});
