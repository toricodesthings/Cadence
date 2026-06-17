import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";
import { hashIdentifier } from "../../src/platform/log";
import { FakeRedis } from "../helpers/fake-redis";
import { rlKeys } from "../../src/domains/ai/safety/rate-limit-keys";

const {
    getDbClientMock,
    withRlsMock,
    getRedisMock,
    getRateLimitRedisMock,
    appendUserMessageMock,
} = vi.hoisted(() => ({
    getDbClientMock: vi.fn(() => ({})),
    withRlsMock: vi.fn(),
    getRedisMock: vi.fn(() => null),
    getRateLimitRedisMock: vi.fn(),
    appendUserMessageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/platform/db", () => ({ getDbClient: getDbClientMock }));
vi.mock("../../src/platform/rls", () => ({
    withRls: (_db: unknown, userId: string, fn: (tx: unknown) => unknown) => withRlsMock(userId, fn),
}));
vi.mock("../../src/platform/redis", () => ({
    getRedis: getRedisMock,
    getRateLimitRedis: getRateLimitRedisMock,
}));
vi.mock("../../src/domains/ai/persistence/conversation-repo", () => ({
    appendUserMessage: appendUserMessageMock,
    // Unused-by-these-tests exports the route imports at module load:
    resolveOrCreateConversation: vi.fn().mockResolvedValue({ id: "conv-1" }),
    loadConversationMessages: vi.fn().mockResolvedValue([]),
    getConversation: vi.fn(),
    saveAssistantMessage: vi.fn(),
    touchConversation: vi.fn(),
    listConversations: vi.fn(),
    renameOrArchiveConversation: vi.fn(),
    deleteConversation: vi.fn(),
    setActiveStream: vi.fn(),
    finalizeActiveStream: vi.fn(),
}));

import { aiRoutes } from "../../src/domains/ai/ai.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

function createApp() {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError((err, c) => {
        const res = formatErrorResponse(err);
        return c.json(res.body, res.status as 500);
    });
    app.use("*", createRequestContext());
    app.use("*", async (c, next) => {
        c.set("userId", TEST_USER_ID);
        await next();
    });
    app.route("/ai", aiRoutes as any);
    return app;
}

const chatBody = () => ({
    message: { id: "m1", role: "user", parts: [{ type: "text", text: "hello there" }] },
    currentDate: new Date().toISOString(),
    timezone: "UTC",
});

beforeEach(() => {
    vi.clearAllMocks();
    withRlsMock.mockImplementation((_userId: string, fn: (tx: unknown) => unknown) => fn({}));
});

describe("POST /ai/chat — usage budget admission", () => {
    it("rejects an over-budget turn with 429 AI_RATE_LIMITED + Retry-After/X-RateLimit headers, persisting NO user turn", async () => {
        const redis = new FakeRedis();
        // Seed the 5h request counter at the (env-overridden) limit so the next admit breaches.
        const userKey = await hashIdentifier(TEST_USER_ID);
        redis.strings.set(rlKeys(userKey).req5h, "1");
        getRateLimitRedisMock.mockReturnValue(redis);

        const app = createApp();
        const res = await app.request(
            "/ai/chat",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chatBody()) },
            { AI_RL_REQUESTS_5H: "1" },
        );

        expect(res.status).toBe(429);
        const body = (await res.json()) as { error: { code: string; isRetryable: boolean } };
        expect(body.error.code).toBe("AI_RATE_LIMITED");
        expect(body.error.isRetryable).toBe(true);
        expect(res.headers.get("Retry-After")).toBeTruthy();
        expect(res.headers.get("X-RateLimit-Remaining-Tokens-5h")).toBeTruthy();
        // Admission precedes persistence → an over-budget user produces no orphan turn.
        expect(appendUserMessageMock).not.toHaveBeenCalled();
    });

    it("fails closed (429) when the store is unreachable and FAIL_MODE=closed", async () => {
        // A redis whose EVAL throws → admit() throws → fail-mode policy decides.
        getRateLimitRedisMock.mockReturnValue({
            eval: async () => {
                throw new Error("redis down");
            },
        } as any);

        const app = createApp();
        const res = await app.request(
            "/ai/chat",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chatBody()) },
            { AI_RATE_LIMIT_FAIL_MODE: "closed" },
        );

        expect(res.status).toBe(429);
        expect(appendUserMessageMock).not.toHaveBeenCalled();
    });
});

describe("GET /ai/usage", () => {
    it("returns the caller's live budget when the store is reachable", async () => {
        getRateLimitRedisMock.mockReturnValue(new FakeRedis());
        const app = createApp();
        const res = await app.request("/ai/usage", {}, { AI_RL_REQUESTS_5H: "42" });

        expect(res.status).toBe(200);
        const { data } = (await res.json()) as { data: any };
        expect(data.enabled).toBe(true);
        expect(data.windows["5h"].requests).toEqual({ used: 0, limit: 42 });
        expect(data.windows["7d"]).toBeDefined();
    });

    it("returns a disabled placeholder when the budget store is not configured", async () => {
        getRateLimitRedisMock.mockReturnValue(null);
        const app = createApp();
        const res = await app.request("/ai/usage", {}, {});

        expect(res.status).toBe(200);
        const { data } = (await res.json()) as { data: any };
        expect(data.enabled).toBe(false);
        expect(data.windows["5h"].tokens.used).toBe(0);
    });
});
