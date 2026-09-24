import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { aiRoutes } from "../../src/domains/ai/ai.route";
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

describe("answering approvals", () => {
    const WAITING = { type: "tool-create_tag", toolCallId: "call-1", state: "approval-requested", input: { name: "Errands" }, approval: { id: "ap-1" } };
    const answer = (conversationId: string, id = "ap-1") => ({
        conversationId,
        approvals: [{ id, approved: true }],
        currentDate: "2026-09-23T12:00:00.000Z",
    });

    it("refuses when the thread's last reply isn't waiting on that approval", async () => {
        const settled = await seedThread(userId);
        const waiting = await seedThread(userId, { assistantParts: [WAITING] });

        expect((await ai("POST", "/chat", answer(settled))).status).toBe(409);
        expect((await ai("POST", "/chat", answer(waiting, "ap-other"))).status).toBe(409);
    });

    it("treats another user's thread as not found and leaves its approval waiting", async () => {
        const theirs = await seedThread(otherId, { assistantParts: [WAITING] });

        expect((await ai("POST", "/chat", answer(theirs))).status).toBe(404);
        expect((await otherAi("GET", `/conversations/${theirs}`)).body.data.messages[1].parts[0].state).toBe("approval-requested");
    });
});
