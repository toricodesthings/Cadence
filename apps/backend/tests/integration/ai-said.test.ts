import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { buildToolRegistry } from "../../src/domains/ai/tools";
import { withRls } from "../../src/platform/rls";
import { tasks } from "../../src/db/schema";

let userId: string;
const ctx = { timezone: "America/New_York", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" };
const run = (userTexts: string[] | undefined, name: string, input: unknown, answeredField?: "priority" | "effort") => {
    const tools = buildToolRegistry({} as never, userId, { ...ctx, userTexts, answeredField }) as any;
    return tools[name].execute(input, { toolCallId: crypto.randomUUID(), messages: [] });
};
const row = (id: string) => withRls(getTestDb(), userId, async (tx) => (await tx.select().from(tasks).where(eq(tasks.id, id)))[0]);

beforeAll(startTestDb);
beforeEach(async () => { userId = await createUser({ zone: "America/New_York" }); });

describe("said check", () => {
    it("keeps a quoted priority, folding case and spacing", async () => {
        const { created } = await run(["Call the bank   ASAP please"], "create_tasks", { tasks: [{ title: "Call bank", priority: 4, said: { priority: "call the bank asap" } }] });
        expect((await row(created[0].taskId)).priority).toBe(4);
    });

    it("a quote must be whole words carrying a cue: a letter or a day never sets Urgent", async () => {
        for (const quote of ["d", "friday", "dentist fri"]) {
            const { created } = await run(["dentist friday"], "create_tasks", { tasks: [{ title: "Dentist", priority: 4, said: { priority: quote } }] });
            expect((await row(created[0].taskId)).priority).toBe(0);
        }
    });

    it("the tapped answer to \"Which matters most?\" is its own quote, only for that field", async () => {
        const { created } = await run(["x"], "create_tasks", { tasks: [{ title: "Essay" }] });
        const id = created[0].taskId;
        await run(["what first?", "Essay"], "update_tasks", { taskIds: [id], patch: { priority: 3, said: { priority: "Essay" } } }, "priority");
        expect((await row(id)).priority).toBe(3);
        const result = await run(["what first?", "Essay"], "update_tasks", { taskIds: [id], patch: { effort: 3, said: { effort: "Essay" } } }, "priority");
        expect(result).toMatchObject({ updated: 0 });
        expect((await row(id)).effort).toBeNull();
    });

    it("drops an invented priority and says why", async () => {
        const result = await run(["dentist Friday"], "create_tasks", { tasks: [{ title: "Dentist", priority: 3 }] });
        expect(result.ignored).toEqual(["Dentist: priority: not in their words (an image's words go in fromImage on create_tasks)"]);
        expect((await row(result.created[0].taskId)).priority).toBe(0);
    });

    it("stores a quoted effort as the person's own choice", async () => {
        const { created } = await run(["a big essay"], "create_tasks", { tasks: [{ title: "Essay", effort: 3, said: { effort: "big essay" } }] });
        expect(await row(created[0].taskId)).toMatchObject({ effort: 3, effortOrigin: "manual" });
    });

    it("drops an unquoted effort", async () => {
        const result = await run(["essay"], "create_tasks", { tasks: [{ title: "Essay", effort: 3 }] });
        expect((await row(result.created[0].taskId)).effort).toBeNull();
    });

    it("checks update_tasks the same way", async () => {
        const { created } = await run(["x"], "create_tasks", { tasks: [{ title: "A" }] });
        const id = created[0].taskId;
        expect((await run(["make it urgent"], "update_tasks", { taskIds: [id], patch: { priority: 4 } })).ignored).toBeDefined();
        expect((await row(id)).priority).toBe(0);
        await run(["make it urgent"], "update_tasks", { taskIds: [id], patch: { priority: 4, said: { priority: "urgent" } } });
        expect((await row(id)).priority).toBe(4);
    });

    it("skips the check off the chat (MCP): no quote needed, no evidence", async () => {
        const { created } = await run(undefined, "create_tasks", { tasks: [{ title: "A", priority: 3, effort: 2 }] });
        expect(await row(created[0].taskId)).toMatchObject({ priority: 3, effort: 2, effortOrigin: null });
    });
});

describe("field-question back-off", () => {
    const ask = () => run(["what first?"], "ask_user", { question: "Which matters most today?", options: [{ label: "Essay" }, { label: "None in particular" }], field: "priority" });

    it("holds the question back for a week after they typed past it, and asks again once they answered", async () => {
        const { settleFieldQuestion } = await import("../../src/domains/ai/tools/ask");
        const { users } = await import("../../src/db/schema");
        const settings = () => withRls(getTestDb(), userId, async (tx) => (await tx.select({ s: users.settings }).from(users).where(eq(users.id, userId)))[0].s);
        const settle = async (reply: string) => { const stored = await settings(); await withRls(getTestDb(), userId, (tx) => settleFieldQuestion(tx, userId, stored, reply)); };

        expect(await ask()).toEqual({ asked: true });
        await settle("move the dentist instead");
        expect((await ask()).asked).toBe(false);
        // A retry without `field` is the same question.
        expect((await run(["what first?"], "ask_user", { question: "Which matters most today?", options: [{ label: "Essay" }, { label: "Laundry" }] })).asked).toBe(false);

        await withRls(getTestDb(), userId, (tx) => tx.update(users).set({ settings: { assistant: { fieldAsk: { priority: { lastOn: "2026-09-23", misses: 0 } } } } }).where(eq(users.id, userId)));
        expect(await ask()).toEqual({ asked: true });
        await settle("Essay");
        expect((await settings() as any).assistant.fieldAsk.priority).toEqual({ lastOn: "2026-09-23", misses: 0 });
    });
});
