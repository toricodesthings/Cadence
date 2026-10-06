/**
 * The model is chosen per TURN, not per thread: a conversation that opens on the
 * cheap model moves to the standard one the moment the user asks for something
 * complex, and back again. Drives the real route with a scripted model.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolLoopAgent } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { apiAs, TEST_USER_ID } from "../helpers/app";

const { getDbClientMock, getRedisMock, getRateLimitRedisMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(() => ({})),
    getRedisMock: vi.fn(() => null),
    getRateLimitRedisMock: vi.fn(() => null),
}));

vi.mock("../../src/platform/db", () => ({ getDbClient: getDbClientMock }));
vi.mock("../../src/platform/rls", () => ({
    withRls: (_db: unknown, _userId: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("../../src/platform/user-zone", () => ({ syncUserZone: async (_tx: unknown, _userId: string, zone: string) => zone }));
vi.mock("../../src/platform/redis", () => ({ getRedis: getRedisMock, getRateLimitRedis: getRateLimitRedisMock }));
vi.mock("../../src/domains/ai/persistence/conversation-repo");
vi.mock("../../src/domains/ai/agent");

import {
    resolveOrCreateConversation,
    loadConversationMessages,
    truncateMessagesAfter,
    touchConversation,
    saveAssistantMessage,
} from "../../src/domains/ai/persistence/conversation-repo";
import { getAgentInstance } from "../../src/domains/ai/agent";
import { aiRoutes } from "../../src/domains/ai/ai.route";

const CONV_ID = "22222222-2222-4222-8222-222222222222";
const ENV = { AI_CHAT_MODEL: "std/model", AI_CHAT_MODEL_BASIC: "basic/model" };

/** A model that just answers — the turn's routing is what's under test, not tool use. */
const scriptedModel = () =>
    new MockLanguageModelV4({
        doStream: async () => ({
            stream: convertArrayToReadableStream([
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: "Done." },
                { type: "text-end", id: "t" },
                {
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage: {
                        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                        outputTokens: { total: 1, text: 1, reasoning: 0 },
                    },
                },
            ] as never[]),
        }),
    });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveOrCreateConversation).mockResolvedValue({ id: CONV_ID, created: false, title: "t" });
    vi.mocked(loadConversationMessages).mockResolvedValue([]);
    vi.mocked(truncateMessagesAfter).mockResolvedValue(false);
    vi.mocked(getAgentInstance).mockResolvedValue({
        agent: new ToolLoopAgent({ model: scriptedModel(), tools: {} }) as never,
        modelId: "unused",
        promptHash: "hash",
        turnContext: "",
    });
});

/** Send one user turn on the shared conversation; returns the model persisted for it. */
async function turn(text: string): Promise<string | undefined> {
    const api = apiAs(TEST_USER_ID, "/ai", aiRoutes, ENV);
    const { status } = await api("POST", "/chat", {
        conversationId: CONV_ID,
        message: { id: `m-${text.slice(0, 8)}`, role: "user", parts: [{ type: "text", text }] },
        currentDate: "2026-09-29T14:00:00.000Z",
        timezone: "America/Toronto",
        approvalMode: "ask",
    });
    expect(status).toBe(200);
    return vi.mocked(touchConversation).mock.calls.at(-1)?.[3]?.model;
}

describe("model routing across one conversation", () => {
    it("opens basic, upgrades when the ask gets complex, and drops back", async () => {
        expect(await turn("add milk to groceries")).toBe("basic/model");
        expect(await turn("plan my week around that")).toBe("std/model");
        expect(await turn("mark the dentist task done")).toBe("basic/model");
    });

    it("passes the turn's model to the agent build and stamps it on the saved reply", async () => {
        await turn("what's on today?");
        expect(vi.mocked(getAgentInstance).mock.calls.at(-1)?.[2]).toMatchObject({ modelId: "basic/model" });
        expect(vi.mocked(saveAssistantMessage).mock.calls.at(-1)?.[3]?.metadata).toMatchObject({ model: "basic/model" });

        await turn("why is my week so full");
        expect(vi.mocked(getAgentInstance).mock.calls.at(-1)?.[2]).toMatchObject({ modelId: "std/model" });
        expect(vi.mocked(saveAssistantMessage).mock.calls.at(-1)?.[3]?.metadata).toMatchObject({ model: "std/model" });
    });
});
