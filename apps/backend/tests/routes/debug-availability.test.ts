import { describe, expect, it } from "vitest";
import worker from "../../src/index";

function createExecutionContext(): ExecutionContext {
    return {
        exports: {},
        passThroughOnException() {},
        props: {},
        waitUntil() {},
    } as unknown as ExecutionContext;
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        ENABLE_DEBUG_ROUTES: undefined,
        DEPLOYMENT_STAGE: undefined,
        ...overrides,
    } as any;
}

describe("debug route availability", () => {
    it("returns 404 when debug routes are not explicitly enabled", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities"),
            createEnv({ DEPLOYMENT_STAGE: "development" }),
            createExecutionContext(),
        );

        expect(response.status).toBe(404);
    });

    it("returns 404 in production even when ENABLE_DEBUG_ROUTES is true", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities"),
            createEnv({ DEPLOYMENT_STAGE: "production", ENABLE_DEBUG_ROUTES: "true" }),
            createExecutionContext(),
        );

        expect(response.status).toBe(404);
    });

    it("returns 404 when DEPLOYMENT_STAGE is absent (defaults to production)", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities"),
            createEnv({ ENABLE_DEBUG_ROUTES: "true" }),
            createExecutionContext(),
        );

        expect(response.status).toBe(404);
    });

    it("falls through to auth when debug routes are enabled in development", async () => {
        const response = await worker.fetch(
            new Request("http://localhost/api/debug/capabilities"),
            createEnv({ DEPLOYMENT_STAGE: "development", ENABLE_DEBUG_ROUTES: "true" }),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
    });
});
