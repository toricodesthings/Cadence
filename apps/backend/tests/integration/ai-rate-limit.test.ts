/**
 * The usage budget as the chat route applies it: admit before persisting, settle in
 * onFinish, headers on both paths. Drives the real route with a scripted model.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentOf, textModel } from "../helpers/ai";
import { apiAs, TEST_USER_ID } from "../helpers/app";
import { hashIdentifier } from "../../src/platform/log";
import { FakeRedis } from "../helpers/fake-redis";
import { rlKeys } from "../../src/domains/ai/safety/rate-limit-keys";

const { getRateLimitRedisMock } = vi.hoisted(() => ({ getRateLimitRedisMock: vi.fn() }));

vi.mock("../../src/platform/db", () => ({ getDbClient: () => ({}) }));
vi.mock("../../src/platform/rls", () => ({
    withRls: (_db: unknown, _userId: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("../../src/platform/user-zone", () => ({ syncUserZone: async (_tx: unknown, _userId: string, zone: string) => zone }));
vi.mock("../../src/platform/redis", () => ({ getRedis: () => null, getRateLimitRedis: getRateLimitRedisMock }));
vi.mock("../../src/domains/ai/persistence/conversation-repo");
vi.mock("../../src/domains/ai/agent");
vi.mock("../../src/domains/ai/images/chat-images", async (original) => ({
    ...(await original<object>()),
    resolveTurnImages: async () => ({ newCount: 1 }),
}));

import {
    appendUserMessage,
    loadConversationMessages,
    resolveOrCreateConversation,
    truncateMessagesAfter,
} from "../../src/domains/ai/persistence/conversation-repo";
import { getAgentInstance } from "../../src/domains/ai/agent";
import { aiRoutes } from "../../src/domains/ai/ai.route";

const CONV_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ID = "0b9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b";

let keys: ReturnType<typeof rlKeys>;

beforeEach(async () => {
    vi.clearAllMocks();
    keys = rlKeys(await hashIdentifier(TEST_USER_ID));
    vi.mocked(resolveOrCreateConversation).mockResolvedValue({ id: CONV_ID, created: false, title: "t" });
    vi.mocked(loadConversationMessages).mockResolvedValue([]);
    vi.mocked(truncateMessagesAfter).mockResolvedValue(false);
    vi.mocked(getAgentInstance).mockResolvedValue(agentOf(textModel()));
});

/** One chat turn; the stream is drained so onFinish (and settle) has run on return. */
async function chat(env: Record<string, unknown> = {}, parts: unknown[] = [{ type: "text", text: "hello there" }]) {
    const res = await apiAs(TEST_USER_ID, "/ai", aiRoutes, env)("POST", "/chat", {
        conversationId: CONV_ID,
        message: { id: "m1", role: "user", parts },
        currentDate: "2026-09-29T14:00:00.000Z",
        timezone: "UTC",
    });
    if (!res.body) await res.response.text();
    return res;
}

describe("POST /ai/chat — usage budget", () => {
    it("settles an admitted turn: the slot is released and the reserve trued up to actual", async () => {
        const redis = new FakeRedis();
        getRateLimitRedisMock.mockReturnValue(redis);

        const { status, response } = await chat();

        expect(status).toBe(200);
        expect(response.headers.get("X-RateLimit-Remaining-Requests-5h")).toBe("149");
        expect(redis.strings.get(keys.req5h)).toBe("1");
        expect(redis.strings.get(keys.inflight)).toBe("0");
        expect(redis.strings.get(keys.tok5h)).toBe("2");
        expect(redis.commandLog.filter((c) => c === "eval")).toHaveLength(2); // admit + settle
    });

    it("rejects an over-budget turn with 429 AI_RATE_LIMITED + headers, persisting NO user turn", async () => {
        const redis = new FakeRedis();
        redis.strings.set(keys.req5h, "1");
        getRateLimitRedisMock.mockReturnValue(redis);

        const { status, body, response } = await chat({ AI_RL_REQUESTS_5H: "1" });

        expect(status).toBe(429);
        expect(body.error).toMatchObject({ code: "AI_RATE_LIMITED", isRetryable: true });
        expect(response.headers.get("Retry-After")).toBe(String(5 * 60 * 60));
        expect(response.headers.get("X-RateLimit-Remaining-Requests-5h")).toBe("0");
        expect(appendUserMessage).not.toHaveBeenCalled();
        expect(redis.commandLog).toEqual(["eval"]); // no settle for a turn never admitted
    });

    it("rejects only on the image quota as AI_IMAGE_LIMITED", async () => {
        const redis = new FakeRedis();
        redis.strings.set(keys.img24h, "20");
        getRateLimitRedisMock.mockReturnValue(redis);

        const { status, body } = await chat({}, [
            { type: "file", mediaType: "image/webp", url: `cadence-image:${IMAGE_ID}` },
            { type: "text", text: "what is this?" },
        ]);

        expect(status).toBe(429);
        expect(body.error.code).toBe("AI_IMAGE_LIMITED");
        expect(appendUserMessage).not.toHaveBeenCalled();
    });

    it("fails open by default when the store is unreachable, and never settles", async () => {
        const evalMock = vi.fn(async () => {
            throw new Error("redis down");
        });
        getRateLimitRedisMock.mockReturnValue({ eval: evalMock });

        expect((await chat()).status).toBe(200);
        expect(evalMock).toHaveBeenCalledTimes(1);
    });

    it("fails closed (429) when the store is unreachable and FAIL_MODE=closed", async () => {
        getRateLimitRedisMock.mockReturnValue({
            eval: async () => {
                throw new Error("redis down");
            },
        });

        expect((await chat({ AI_RATE_LIMIT_FAIL_MODE: "closed" })).status).toBe(429);
        expect(appendUserMessage).not.toHaveBeenCalled();
    });
});

describe("GET /ai/usage", () => {
    const usage = (env: Record<string, unknown> = {}) => apiAs(TEST_USER_ID, "/ai", aiRoutes, env)("GET", "/usage");

    it("returns the caller's live budget when the store is reachable", async () => {
        getRateLimitRedisMock.mockReturnValue(new FakeRedis());
        const { status, body } = await usage({ AI_RL_REQUESTS_5H: "42" });

        expect(status).toBe(200);
        expect(body.data.enabled).toBe(true);
        expect(body.data.windows["5h"].requests).toEqual({ used: 0, limit: 42 });
        expect(body.data.windows["7d"]).toBeDefined();
    });

    it("returns a disabled placeholder when the budget store is not configured", async () => {
        getRateLimitRedisMock.mockReturnValue(null);
        const { status, body } = await usage();

        expect(status).toBe(200);
        expect(body.data.enabled).toBe(false);
        expect(body.data.windows["5h"].tokens.used).toBe(0);
    });
});
