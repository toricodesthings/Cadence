import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";
import { MAX_PART_BYTES } from "../../src/domains/ai/safety/input-guard";

const { getDbClientMock, withRlsMock, getRedisMock, getConversationMock, attachToolOutputMock } = vi.hoisted(() => ({
    getDbClientMock: vi.fn(() => ({})),
    withRlsMock: vi.fn(),
    getRedisMock: vi.fn(() => null),
    getConversationMock: vi.fn(),
    attachToolOutputMock: vi.fn(),
}));

vi.mock("../../src/platform/db", () => ({ getDbClient: getDbClientMock }));
vi.mock("../../src/platform/rls", () => ({
    withRls: (_db: unknown, userId: string, fn: (tx: unknown) => unknown) => withRlsMock(userId, fn),
}));
vi.mock("../../src/platform/redis", () => ({ getRedis: getRedisMock }));
vi.mock("../../src/domains/ai/persistence/conversation-repo", () => ({
    getConversation: getConversationMock,
    attachToolOutput: attachToolOutputMock,
    // Unused-by-these-tests exports the route imports at module load:
    resolveOrCreateConversation: vi.fn(),
    loadConversationMessages: vi.fn(),
    appendUserMessage: vi.fn(),
    truncateMessagesAfter: vi.fn(),
    deleteAllMessages: vi.fn(),
    saveAssistantMessage: vi.fn(),
    touchConversation: vi.fn(),
    listConversations: vi.fn(),
    renameOrArchiveConversation: vi.fn(),
    deleteConversation: vi.fn(),
    setActiveStream: vi.fn(),
    finalizeActiveStream: vi.fn(),
    setTitleIfEmpty: vi.fn(),
}));

import { aiRoutes } from "../../src/domains/ai/ai.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_ID = "msg-assistant-1";

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

function post(body: unknown, messageId = MESSAGE_ID) {
    return createApp().request(
        `/ai/conversations/${CONV_ID}/messages/${messageId}/tool-output`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
        {},
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    withRlsMock.mockImplementation((_userId: string, fn: (tx: unknown) => unknown) => fn({}));
});

describe("POST /ai/conversations/:id/messages/:messageId/tool-output", () => {
    it("persists a resolved proposal decision on an owned assistant message", async () => {
        getConversationMock.mockResolvedValue({ id: CONV_ID });
        attachToolOutputMock.mockResolvedValue(true);

        const res = await post({ toolCallId: "call-1", output: { decision: "commit" } });

        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data).toEqual({ updated: true });
        expect(attachToolOutputMock).toHaveBeenCalledWith({}, TEST_USER_ID, CONV_ID, MESSAGE_ID, {
            toolCallId: "call-1",
            output: { decision: "commit" },
        });
    });

    it("reports updated:false when the part is already settled or the toolCallId is unknown", async () => {
        getConversationMock.mockResolvedValue({ id: CONV_ID });
        attachToolOutputMock.mockResolvedValue(false);

        const res = await post({ toolCallId: "already-resolved", output: { decision: "dismiss" } });

        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data).toEqual({ updated: false });
    });

    it("404s when the conversation is not owned (RLS) and never writes", async () => {
        getConversationMock.mockResolvedValue(null);

        const res = await post({ toolCallId: "call-1", output: { decision: "commit" } });

        expect(res.status).toBe(404);
        expect(attachToolOutputMock).not.toHaveBeenCalled();
    });

    it("400s on an output payload larger than a message part cap, before touching the DB", async () => {
        getConversationMock.mockResolvedValue({ id: CONV_ID });

        const res = await post({ toolCallId: "call-1", output: { blob: "x".repeat(MAX_PART_BYTES + 1) } });

        expect(res.status).toBe(400);
        expect(attachToolOutputMock).not.toHaveBeenCalled();
    });

    it("400s when toolCallId is missing (schema-validated)", async () => {
        getConversationMock.mockResolvedValue({ id: CONV_ID });

        const res = await post({ output: { decision: "commit" } });

        expect(res.status).toBe(400);
        expect(attachToolOutputMock).not.toHaveBeenCalled();
    });
});
