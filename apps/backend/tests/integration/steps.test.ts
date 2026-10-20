/** POST /ai/steps: Suggest steps, with the model scripted. A draft only: nothing is stored before Keep. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText: vi.fn() }));

import { generateText } from "ai";
import { aiRoutes } from "../../src/domains/ai/ai.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

const ENV = { OPENROUTER_API_KEY: "test", AI_CHAT_MODEL: "test/model" };
let userId: string;
let ai: ReturnType<typeof apiAs>;
let tasks: ReturnType<typeof apiAs>;

const sql = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
const reply = (steps: string[]) => vi.mocked(generateText).mockResolvedValue({ output: { steps }, usage: { inputTokens: 10, outputTokens: 5 }, providerMetadata: {}, response: {} } as never);

beforeAll(startTestDb);
beforeEach(async () => {
    vi.mocked(generateText).mockReset();
    userId = await createUser();
    ai = apiAs(userId, "/ai", aiRoutes, ENV);
    tasks = apiAs(userId, "/tasks", taskRoutes);
});

describe("POST /ai/steps", () => {
    it("returns 3–7 steps of at most 80 characters and stores nothing", async () => {
        const task = (await tasks("POST", "", { title: "Sort the garage", orderIndex: 1 })).body.data;
        reply(["Open the garage door", "Pick one shelf", `Put ${"very ".repeat(30)}old paint by the door`, "Bag the obvious rubbish"]);
        const res = await ai("POST", "/steps", { taskId: task.id });
        expect(res.status).toBe(200);
        expect(res.body.data.steps).toHaveLength(4);
        expect(res.body.data.steps.every((s: string) => s.length <= 80)).toBe(true);
        expect(await sql("SELECT 1 FROM subtasks WHERE task_id = $1", [task.id])).toHaveLength(0);
    });

    it("sends only the title, the first 1,000 characters of the note, the list and existing steps", async () => {
        const list = (await apiAs(userId, "/projects", (await import("../../src/domains/projects/projects.route")).projectRoutes)("POST", "", { name: "Home", orderIndex: 1 })).body.data;
        const task = (await tasks("POST", "", { title: "Paint the hall", orderIndex: 1, projectId: list.id })).body.data;
        await tasks("POST", "", { title: "Secret other task", orderIndex: 2 });
        await sql("INSERT INTO task_notes (task_id, user_id, body) VALUES ($1, $2, $3)", [task.id, userId, `${"a".repeat(1000)}TAIL`]);
        await sql("INSERT INTO subtasks (task_id, user_id, title, order_index) VALUES ($1, $2, 'Buy paint', 0)", [task.id, userId]);
        reply(["Clear the hall", "Lay down sheets", "Tape the edges"]);
        await ai("POST", "/steps", { taskId: task.id });
        const { prompt } = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
        expect(prompt).toContain("Paint the hall");
        expect(prompt).toContain("List: Home");
        expect(prompt).toContain("- Buy paint");
        expect(prompt).toContain("a".repeat(1000));
        expect(prompt).not.toContain("TAIL");
        expect(prompt).not.toContain("Secret other task");
    });

    it("answers 504 after the 8-second timeout, and 404 for a task that isn't the caller's", async () => {
        const task = (await tasks("POST", "", { title: "Taxes", orderIndex: 1 })).body.data;
        vi.mocked(generateText).mockRejectedValue(new DOMException("timed out", "TimeoutError"));
        expect((await ai("POST", "/steps", { taskId: task.id })).status).toBe(504);
        expect((await ai("POST", "/steps", { taskId: crypto.randomUUID() })).status).toBe(404);
    });
});
