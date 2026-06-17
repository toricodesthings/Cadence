import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";
import { hashIdentifier } from "../../src/platform/log";
import { FakeRedis } from "../helpers/fake-redis";
import {
    openStream,
    flushChunks,
    closeStream,
    isAbortRequested,
} from "../../src/domains/ai/streaming/resume-store";

const { getDbClientMock, withRlsMock, getRedisMock, getConversationMock, saveAssistantMessageMock } = vi.hoisted(
    () => ({
        getDbClientMock: vi.fn(() => ({})),
        withRlsMock: vi.fn(),
        getRedisMock: vi.fn(),
        getConversationMock: vi.fn(),
        saveAssistantMessageMock: vi.fn().mockResolvedValue(undefined),
    }),
);

vi.mock("../../src/platform/db", () => ({ getDbClient: getDbClientMock }));
vi.mock("../../src/platform/rls", () => ({
    // Invoke the callback with a dummy tx — the repo is mocked, so tx is unused.
    withRls: (_db: unknown, userId: string, fn: (tx: unknown) => unknown) => withRlsMock(userId, fn),
}));
vi.mock("../../src/platform/redis", () => ({ getRedis: getRedisMock }));
vi.mock("../../src/domains/ai/persistence/conversation-repo", () => ({
    getConversation: getConversationMock,
    saveAssistantMessage: saveAssistantMessageMock,
    // Unused-by-these-tests exports the route imports at module load:
    resolveOrCreateConversation: vi.fn(),
    loadConversationMessages: vi.fn(),
    appendUserMessage: vi.fn(),
    touchConversation: vi.fn(),
    listConversations: vi.fn(),
    renameOrArchiveConversation: vi.fn(),
    deleteConversation: vi.fn(),
    setActiveStream: vi.fn(),
    finalizeActiveStream: vi.fn(),
}));

import { aiRoutes } from "../../src/domains/ai/ai.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const SID = "stream_xyz";

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

beforeEach(() => {
    vi.clearAllMocks();
    // Default: withRls just runs the callback with a dummy tx.
    withRlsMock.mockImplementation((_userId: string, fn: (tx: unknown) => unknown) => fn({}));
});

describe("GET /ai/chat/:id/stream (resume)", () => {
    it("204 when resumption is disabled (getRedis null)", async () => {
        getRedisMock.mockReturnValue(null);
        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(204);
    });

    it("204 when there is neither a live nor a recently-finished stream", async () => {
        getRedisMock.mockReturnValue(new FakeRedis());
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: null, lastStreamId: null });
        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(204);
    });

    it("404 when the conversation is not owned (RLS)", async () => {
        getRedisMock.mockReturnValue(new FakeRedis());
        getConversationMock.mockResolvedValue(null);
        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(404);
    });

    it("replays the buffered frames for a live stream", async () => {
        const redis = new FakeRedis();
        const userKey = await hashIdentifier(TEST_USER_ID);
        await openStream(redis as any, userKey, SID, {
            conversationId: CONV_ID,
            userId: TEST_USER_ID,
            messageId: "msg-1",
            model: "m",
        });
        await flushChunks(redis as any, userKey, SID, "data: hello\n\n");
        await flushChunks(redis as any, userKey, SID, "data: world\n\n");
        await closeStream(redis as any, userKey, SID, "done");

        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: SID });

        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("data: hello\n\ndata: world\n\n");
    });

    it("grace-replays a just-finished stream via lastStreamId (no live stream)", async () => {
        // The active pointer is already cleared (turn finished), but the chunk-log is
        // still alive within the close grace window — a slightly-late re-attach replays it.
        const redis = new FakeRedis();
        const userKey = await hashIdentifier(TEST_USER_ID);
        await openStream(redis as any, userKey, SID, {
            conversationId: CONV_ID,
            userId: TEST_USER_ID,
            messageId: "msg-1",
            model: "m",
        });
        await flushChunks(redis as any, userKey, SID, "data: hello\n\n");
        await flushChunks(redis as any, userKey, SID, "data: world\n\n");
        await closeStream(redis as any, userKey, SID, "done");

        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: null, lastStreamId: SID });

        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("data: hello\n\ndata: world\n\n");
    });

    it("204 when the recently-finished log has expired past the grace window", async () => {
        // lastStreamId points at a stream whose Redis log is already gone (TTL reaped):
        // readMeta is null, so there is nothing to replay → 204 (client falls back to DB).
        getRedisMock.mockReturnValue(new FakeRedis());
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: null, lastStreamId: SID });
        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(204);
    });

    it("204 when the stream meta names a different user (gate #2, §15.1)", async () => {
        const redis = new FakeRedis();
        const userKey = await hashIdentifier(TEST_USER_ID);
        await openStream(redis as any, userKey, SID, {
            conversationId: CONV_ID,
            userId: "someone-else",
            messageId: "msg-1",
            model: "m",
        });

        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: SID });

        const res = await createApp().request(`/ai/chat/${CONV_ID}/stream`);
        expect(res.status).toBe(204);
    });
});

describe("POST /ai/chat/:id/stop", () => {
    async function post(body: unknown) {
        return createApp().request(`/ai/chat/${CONV_ID}/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    it("sets the cross-isolate abort flag and returns success", async () => {
        const redis = new FakeRedis();
        const userKey = await hashIdentifier(TEST_USER_ID);
        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: SID });

        const res = await post({});
        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data).toEqual({ success: true });
        expect(await isAbortRequested(redis as any, userKey, SID)).toBe(true);
    });

    it("is a no-op when there is no active stream", async () => {
        const redis = new FakeRedis();
        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: null });

        const res = await post({});
        expect(((await res.json()) as any).data).toEqual({ success: true });
        expect(redis.commandLog).not.toContain("set"); // no abort flag written
    });

    it("does not stop a newer turn when activeStreamId mismatches", async () => {
        const redis = new FakeRedis();
        const userKey = await hashIdentifier(TEST_USER_ID);
        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: SID });

        const res = await post({ activeStreamId: "a-different-older-stream" });
        expect(((await res.json()) as any).data).toEqual({ success: true });
        expect(await isAbortRequested(redis as any, userKey, SID)).toBe(false);
    });

    it("persists the partial assistant snapshot when provided", async () => {
        const redis = new FakeRedis();
        getRedisMock.mockReturnValue(redis);
        getConversationMock.mockResolvedValue({ id: CONV_ID, activeStreamId: SID });

        const assistantMessage = { id: "msg-1", role: "assistant" as const, parts: [{ type: "text", text: "partial" }] };
        await post({ activeStreamId: SID, assistantMessage });
        expect(saveAssistantMessageMock).toHaveBeenCalledWith(
            expect.anything(),
            TEST_USER_ID,
            CONV_ID,
            expect.objectContaining({ id: "msg-1" }),
            { status: "aborted" },
        );
    });

    it("404 when the conversation is not owned (RLS)", async () => {
        getRedisMock.mockReturnValue(new FakeRedis());
        getConversationMock.mockResolvedValue(null);
        const res = await post({});
        expect(res.status).toBe(404);
    });
});
