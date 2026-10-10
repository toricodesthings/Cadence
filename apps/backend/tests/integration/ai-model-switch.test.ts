/**
 * The model is chosen per turn, but only upward: a conversation that opens on the
 * cheap model moves to the standard one the moment the user asks for something
 * complex, and stays there (each model keeps its own prompt cache). Drives the
 * real route with a scripted model.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentOf, textModel } from "../helpers/ai";
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
    getConversation,
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

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveOrCreateConversation).mockResolvedValue({ id: CONV_ID, created: false, title: "t" });
    vi.mocked(loadConversationMessages).mockResolvedValue([]);
    vi.mocked(truncateMessagesAfter).mockResolvedValue(false);
    vi.mocked(getAgentInstance).mockResolvedValue(agentOf(textModel()));
    // The thread remembers the model its last turn touched it with.
    vi.mocked(getConversation).mockImplementation(async () => ({ model: vi.mocked(touchConversation).mock.calls.at(-1)?.[3]?.model ?? null }) as never);
});

/** Send one user turn on the shared conversation; returns the model it was built, saved and touched with. */
async function turn(text: string) {
    const api = apiAs(TEST_USER_ID, "/ai", aiRoutes, ENV);
    const { status } = await api("POST", "/chat", {
        conversationId: CONV_ID,
        message: { id: `m-${text.slice(0, 8)}`, role: "user", parts: [{ type: "text", text }] },
        currentDate: "2026-09-29T14:00:00.000Z",
        timezone: "America/Toronto",
        approvalMode: "ask",
    });
    expect(status).toBe(200);
    return [
        vi.mocked(getAgentInstance).mock.calls.at(-1)?.[2]?.modelId,
        vi.mocked(saveAssistantMessage).mock.calls.at(-1)?.[3]?.metadata?.model,
        vi.mocked(touchConversation).mock.calls.at(-1)?.[3]?.model,
    ];
}

describe("model routing across one conversation", () => {
    it("opens basic, upgrades when the ask gets complex, and stays, on the agent build, saved reply and thread alike", async () => {
        expect(await turn("add milk to groceries")).toEqual(Array(3).fill("basic/model"));
        expect(await turn("mark the dentist task done")).toEqual(Array(3).fill("basic/model"));
        expect(await turn("plan my week around that")).toEqual(Array(3).fill("std/model"));
        expect(await turn("mark the gym task done")).toEqual(Array(3).fill("std/model"));
    });
});
