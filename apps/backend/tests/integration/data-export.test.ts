import { beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createTestApp } from "../helpers/app";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { accountRoutes } from "../../src/domains/account/account.route";
import { aiMemories, tags, taskTags, tasks, mutationDedup } from "../../src/db/schema";
import { withRls } from "../../src/platform/rls";

beforeAll(startTestDb);

/** The account routes acting as `userId` with sign-in email `email`, plus the mailbox the export lands in. */
function accountAs(userId: string, email: string | undefined, sendImpl?: () => Promise<unknown>) {
    const sent: any[] = [];
    const EMAIL = { send: async (message: any) => { sent.push(message); await sendImpl?.(); return { messageId: "m" }; } };
    const app = new Hono();
    app.use("*", async (c, next) => { if (email) c.set("userEmail" as never, email as never); await next(); });
    app.route("/", createTestApp("/account", accountRoutes, userId));
    const call = async (method: string, env: Record<string, unknown> = { EMAIL }) => {
        const pending: Promise<unknown>[] = [];
        const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
        const res = await app.request("http://localhost/account/export", { method }, env, ctx as unknown as ExecutionContext);
        await Promise.all(pending);
        return { status: res.status, body: (await res.json()) as any };
    };
    return { sent, call };
}

describe("data export", () => {
    it("emails one JSON file of only the caller's data and records it", async () => {
        const userId = await createUser();
        const otherId = await createUser();
        await withRls(getTestDb(), userId, async (tx) => {
            const [task] = await tx.insert(tasks).values({ userId, title: "Mine", orderIndex: 0 }).returning();
            const [tag] = await tx.insert(tags).values({ userId, name: "work" }).returning();
            await tx.insert(taskTags).values({ taskId: task.id, tagId: tag.id });
            await tx.insert(aiMemories).values({ userId, content: "likes mornings", embedding: Array(1536).fill(0) });
            await tx.insert(mutationDedup).values({ userId, clientMutationId: "k" });
        });
        await withRls(getTestDb(), otherId, (tx) => tx.insert(tasks).values({ userId: otherId, title: "Theirs", orderIndex: 0 }));

        const { sent, call } = accountAs(userId, "me@example.com");
        const post = await call("POST");
        expect(post.status).toBe(202);
        expect(post.body.data).toMatchObject({ email: "me@example.com", status: "pending" });

        expect(sent).toHaveLength(1);
        expect(sent[0].to).toBe("me@example.com");
        const file = sent[0].attachments[0];
        expect(file.type).toBe("application/json");
        const json = JSON.parse(file.content);
        expect(json.account).toEqual({ id: userId, email: "me@example.com" });
        expect(json.data.tasks.map((t: any) => t.title)).toEqual(["Mine"]);
        expect(json.data.users).toHaveLength(1);
        expect(json.data.task_tags).toHaveLength(1);
        expect(json.data.ai_memories[0].content).toBe("likes mornings");
        expect(json.data.ai_memories[0]).not.toHaveProperty("embedding");
        expect(json.data).not.toHaveProperty("mutation_dedup");
        expect(file.content).not.toContain("Theirs");

        const latest = await call("GET");
        expect(latest.body.data).toMatchObject({ id: post.body.data.id, status: "sent", email: "me@example.com" });
        expect(latest.body.data.completedAt).toEqual(expect.any(String));
    });

    it("allows one export an hour", async () => {
        const { call } = accountAs(await createUser(), "a@example.com");
        expect((await call("POST")).status).toBe(202);
        const again = await call("POST");
        expect(again.status).toBe(429);
    });

    it("marks a failed send and lets the person try again at once", async () => {
        const userId = await createUser();
        const failing = accountAs(userId, "a@example.com", async () => { throw new Error("mail down"); });
        expect((await failing.call("POST")).status).toBe(202);
        expect((await failing.call("GET")).body.data.status).toBe("failed");
        const retry = accountAs(userId, "a@example.com");
        expect((await retry.call("POST")).status).toBe(202);
        expect((await retry.call("GET")).body.data.status).toBe("sent");
    });

    it("answers 503 without the email binding and 400 without an address", async () => {
        const userId = await createUser();
        expect((await accountAs(userId, "a@example.com").call("POST", {})).status).toBe(503);
        expect((await accountAs(userId, undefined).call("POST")).status).toBe(400);
        const count = await asOwner((pg) => pg.query("SELECT count(*)::int AS n FROM data_exports WHERE user_id = $1", [userId]));
        expect((count.rows[0] as any).n).toBe(0);
    });

    it("has nothing to show before the first request", async () => {
        expect((await accountAs(await createUser(), "a@example.com").call("GET")).body.data).toBeNull();
    });
});
