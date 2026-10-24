import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { buildToolRegistry } from "../../src/domains/ai/tools";
import { withRls } from "../../src/platform/rls";
import { tasks } from "../../src/db/schema";

let userId: string;
const ctx = { timezone: "America/New_York", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" };
const run = (userTexts: string[] | undefined, name: string, input: unknown) => {
    const tools = buildToolRegistry({} as never, userId, { ...ctx, userTexts }) as any;
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

    it("drops an invented priority and says why", async () => {
        const result = await run(["dentist Friday"], "create_tasks", { tasks: [{ title: "Dentist", priority: 3 }] });
        expect(result.ignored).toEqual(["Dentist: priority: not in their words"]);
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
