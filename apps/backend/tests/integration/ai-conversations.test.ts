import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { aiRoutes } from "../../src/domains/ai/ai.route";
import { MAX_PART_BYTES } from "../../src/domains/ai/safety/input-guard";
import {
    appendUserMessage,
    resolveOrCreateConversation,
    saveAssistantMessage,
    touchConversation,
} from "../../src/domains/ai/persistence/conversation-repo";
import { withRls } from "../../src/platform/rls";

let userId: string;
let ai: ReturnType<typeof apiAs>;
let otherId: string;
let otherAi: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    otherId = await createUser();
    ai = apiAs(userId, "/ai", aiRoutes);
    otherAi = apiAs(otherId, "/ai", aiRoutes);
});

/** A persisted thread: one user turn plus one assistant turn, seeded through the real repo. */
async function seedThread(owner: string, opts: { lastMessageAt?: string; assistantParts?: unknown[] } = {}) {
    return withRls(getTestDb(), owner, async (tx) => {
        const { id } = await resolveOrCreateConversation(tx, owner, {});
        await appendUserMessage(tx, owner, id, { id: `u-${id}`, role: "user", parts: [{ type: "text", text: "hi" }] }, {});
        await saveAssistantMessage(tx, owner, id, { id: `a-${id}`, role: "assistant", parts: opts.assistantParts ?? [{ type: "text", text: "hello" }] }, { status: "complete" });
        await touchConversation(tx, owner, id, { lastMessageAt: opts.lastMessageAt });
        return id;
    });
}

describe("conversation list and history", () => {
    it("lists only the caller's threads, most recent first", async () => {
        const older = await seedThread(userId, { lastMessageAt: "2026-03-01T00:00:00.000Z" });
        const newer = await seedThread(userId, { lastMessageAt: "2026-03-02T00:00:00.000Z" });
        await seedThread(otherId);

        const { body } = await ai("GET", "/conversations");

        expect(body.data.conversations.map((c: any) => c.id)).toEqual([newer, older]);
    });

    it("loads a thread's messages in order as UI messages", async () => {
        const id = await seedThread(userId);

        const { body } = await ai("GET", `/conversations/${id}`);

        expect(body.data.conversation.id).toBe(id);
        expect(body.data.messages).toEqual([
            { id: `u-${id}`, role: "user", parts: [{ type: "text", text: "hi" }], metadata: {} },
            { id: `a-${id}`, role: "assistant", parts: [{ type: "text", text: "hello" }], metadata: {} },
        ]);
    });
});

describe("rename, archive, delete", () => {
    it("renames and archives a thread", async () => {
        const id = await seedThread(userId);

        expect((await ai("PATCH", `/conversations/${id}`, { title: "Plan the week" })).body.data.title).toBe("Plan the week");
        expect((await ai("PATCH", `/conversations/${id}`, { archived: true })).body.data).toMatchObject({ title: "Plan the week", archived: true });
    });

    it("rejects a patch that changes nothing", async () => {
        expect((await ai("PATCH", `/conversations/${await seedThread(userId)}`, {})).status).toBe(400);
    });

    it("deletes a thread and its messages", async () => {
        const id = await seedThread(userId);

        expect((await ai("DELETE", `/conversations/${id}`)).body.data).toEqual({ id, deleted: true });
        expect((await ai("GET", `/conversations/${id}`)).status).toBe(404);
        const left = await asOwner(async (pg) => (await pg.query<{ n: number }>("SELECT count(*)::int n FROM ai_messages WHERE conversation_id = $1", [id])).rows[0].n);
        expect(left).toBe(0);
    });

    it("treats another user's thread as not found for read, rename, and delete, and leaves it intact", async () => {
        const theirs = await seedThread(otherId);

        expect((await ai("GET", `/conversations/${theirs}`)).status).toBe(404);
        expect((await ai("PATCH", `/conversations/${theirs}`, { title: "hijacked" })).status).toBe(404);
        expect((await ai("DELETE", `/conversations/${theirs}`)).status).toBe(404);
        expect((await otherAi("GET", `/conversations/${theirs}`)).body.data.messages).toHaveLength(2);
    });

    it("refuses to adopt a client-chosen thread id that another user already owns", async () => {
        const theirs = await seedThread(otherId);

        await expect(withRls(getTestDb(), userId, (tx) => resolveOrCreateConversation(tx, userId, { conversationId: theirs }))).rejects.toMatchObject({
            code: "NOT_FOUND",
        });
    });
});

describe("tool output (proposal decisions)", () => {
    const TOOL_PART = { type: "tool-proposeTask", toolCallId: "call-1", state: "input-available", input: { title: "x" } };
    const post = (conv: string, msg: string, body: unknown) => ai("POST", `/conversations/${conv}/messages/${msg}/tool-output`, body);

    it("records the decision on the pending tool part, exactly once", async () => {
        const id = await seedThread(userId, { assistantParts: [{ type: "text", text: "Want me to add it?" }, TOOL_PART] });

        expect((await post(id, `a-${id}`, { toolCallId: "call-1", output: { decision: "commit" } })).body.data).toEqual({ updated: true });
        expect((await post(id, `a-${id}`, { toolCallId: "call-1", output: { decision: "dismiss" } })).body.data).toEqual({ updated: false });

        const { body } = await ai("GET", `/conversations/${id}`);
        expect(body.data.messages[1].parts).toEqual([
            { type: "text", text: "Want me to add it?" },
            { ...TOOL_PART, state: "output-available", output: { decision: "commit" } },
        ]);
    });

    it.each([
        ["an unknown toolCallId", (id: string) => [`a-${id}`, { toolCallId: "nope", output: { decision: "commit" } }]],
        ["a user message", (id: string) => [`u-${id}`, { toolCallId: "call-1", output: { decision: "commit" } }]],
    ] as const)("changes nothing for %s", async (_label, args) => {
        const id = await seedThread(userId, { assistantParts: [TOOL_PART] });
        const [messageId, body] = args(id) as [string, unknown];

        expect((await post(id, messageId, body)).body.data).toEqual({ updated: false });
    });

    it("rejects an oversized output with 400", async () => {
        const id = await seedThread(userId, { assistantParts: [TOOL_PART] });

        expect((await post(id, `a-${id}`, { toolCallId: "call-1", output: { blob: "x".repeat(MAX_PART_BYTES + 1) } })).status).toBe(400);
    });

    it("treats another user's thread as not found and never writes to it", async () => {
        const theirs = await seedThread(otherId, { assistantParts: [TOOL_PART] });

        expect((await post(theirs, `a-${theirs}`, { toolCallId: "call-1", output: { decision: "commit" } })).status).toBe(404);
        expect((await otherAi("GET", `/conversations/${theirs}`)).body.data.messages[1].parts[0].state).toBe("input-available");
    });
});
