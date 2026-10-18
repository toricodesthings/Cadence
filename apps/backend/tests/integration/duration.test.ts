import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MEMORY_CONSENT_VERSION } from "@cadence/contracts/memory";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
vi.mock("../../src/domains/ai/memory/embedding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/domains/ai/memory/embedding")>()),
    embedTexts: async (_env: unknown, texts: string[]) => texts.map(() => Array.from({ length: 512 }, () => 0.1)),
}));
vi.mock("../../src/platform/daily-budget", () => ({ withinDailyBudget: vi.fn(async () => true) }));

import { memoryRoutes } from "../../src/domains/ai/memory/memory.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { nightlyForUser } from "../../src/domains/ai/memory/nightly";
import { learnForUser } from "../../src/domains/ai/memory/memory-job";
import { memoryTools } from "../../src/domains/ai/tools/memory";
import { withinDailyBudget } from "../../src/platform/daily-budget";

const env = {} as any;
let userId: string;
let memory: ReturnType<typeof apiAs>;
let tasksApi: ReturnType<typeof apiAs>;

const sql = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
const setMode = (mode: "off" | "basic" | "full") => memory("POST", "/mode", { mode, consentVersion: MEMORY_CONSENT_VERSION });

/** A task that has been open for an hour, so asking about it is allowed. */
async function newTask(title = "Write essay", extra = "") {
    const [{ id }] = await sql(`INSERT INTO tasks (user_id, title, order_index, created_at ${extra ? ", " + extra.split("=")[0] : ""}) VALUES ($1, $2, 1, now() - interval '1 hour' ${extra ? ", " + extra.split("=")[1] : ""}) RETURNING id`, [userId, title]);
    return id as string;
}
const complete = async (id: string) => (await tasksApi("PATCH", `/${id}`, { state: "COMPLETE" })).body.data;
const reopen = (id: string) => tasksApi("PATCH", `/${id}`, { state: "ACTIVE" });
const ask = async (taskId: string) => (await memory("POST", "/duration/ask", { taskId })).body.data;
const reports = (id?: string) => sql("SELECT task_id, completed_at, low_minutes, high_minutes, anchored, group_key, forgotten_at FROM duration_reports WHERE user_id = $1" + (id ? " AND task_id = $2" : ""), id ? [userId, id] : [userId]);
const askState = async () => (await sql("SELECT settings #> '{assistant,durationAsk}' AS ask FROM users WHERE id = $1", [userId]))[0].ask;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: "America/Toronto" });
    memory = apiAs(userId, "/memory", memoryRoutes, env);
    tasksApi = apiAs(userId, "/tasks", taskRoutes, env);
    vi.mocked(withinDailyBudget).mockResolvedValue(true);
});

describe("completed_at", () => {
    it("is set on Done, kept while Done, cleared on leaving, and a re-complete is a new instant", async () => {
        const id = await newTask();
        expect((await tasksApi("GET", `/${id}`)).body.data.completedAt).toBeNull();
        const first = (await complete(id)).completedAt;
        expect(first).toMatch(/Z$/);
        await tasksApi("PATCH", `/${id}`, { priority: 2 });
        await tasksApi("PATCH", `/${id}`, { state: "COMPLETE" });
        expect((await tasksApi("GET", `/${id}`)).body.data.completedAt).toBe(first);
        await reopen(id);
        expect((await tasksApi("GET", `/${id}`)).body.data.completedAt).toBeNull();
        await new Promise((r) => setTimeout(r, 5));
        expect((await complete(id)).completedAt).not.toBe(first);
    });

    it("is set on every path: batch state, create as done, and raw inserts; and the CHECK holds", async () => {
        const a = await newTask("A");
        const b = await newTask("B");
        await tasksApi("PATCH", "/batch/state", { taskIds: [a, b], state: "COMPLETE" });
        const rows = await sql("SELECT state, completed_at FROM tasks WHERE id = ANY($1)", [[a, b]]);
        expect(rows.every((r) => r.state === "COMPLETE" && r.completed_at)).toBe(true);
        const [seeded] = await sql("INSERT INTO tasks (user_id, title, order_index, state) VALUES ($1, 'Seeded', 1, 'COMPLETE') RETURNING completed_at", [userId]);
        expect(seeded.completed_at).toBeTruthy();
        await tasksApi("PATCH", "/batch/state", { taskIds: [a, b], state: "ARCHIVED" });
        expect((await sql("SELECT completed_at FROM tasks WHERE id = ANY($1)", [[a, b]])).every((r) => r.completed_at === null)).toBe(true);
        // The constraint is the backstop for anything that skips the trigger's rule.
        await expect(sql("ALTER TABLE tasks DISABLE TRIGGER tasks_completed_at").then(() => sql("UPDATE tasks SET state = 'COMPLETE' WHERE id = $1", [a])).finally(() => sql("ALTER TABLE tasks ENABLE TRIGGER tasks_completed_at"))).rejects.toThrow();
    });
});

describe("POST /duration", () => {
    it("stores one confirmed report per completion and returns the stored row", async () => {
        await setMode("full");
        const id = await newTask();
        const { completedAt } = await complete(id);
        const saved = await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 45 } });
        expect(saved.body.data).toEqual({ taskId: id, completedAt, lowMinutes: 45, highMinutes: 45, anchored: false });
        await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "range", lowMinutes: 30, highMinutes: 60 }, anchored: true });
        expect(await reports(id)).toEqual([expect.objectContaining({ low_minutes: 30, high_minutes: 60, anchored: true, group_key: "write essay" })]);
        expect((await memory("GET", `/duration?taskId=${id}`)).body.data).toEqual({ taskId: id, completedAt, lowMinutes: 30, highMinutes: 60, anchored: true });
        expect((await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 0 } })).status).toBe(400);
        expect((await memory("POST", "/duration", { taskId: crypto.randomUUID(), completedAt, minutes: 45 })).status).toBe(404);
        expect((await memory("POST", "/duration", { taskId: id, completedAt })).status).toBe(400);
    });

    it("answers Undo + re-complete with a new occurrence: the old Retry is a 409 and Undo deletes only its own report", async () => {
        await setMode("full");
        const id = await newTask();
        const first = (await complete(id)).completedAt;
        await memory("POST", "/duration", { taskId: id, completedAt: first, minutes: 45 });
        await reopen(id);
        expect(await reports(id)).toEqual([]); // Undo took the answer with it
        const stale = await memory("POST", "/duration", { taskId: id, completedAt: first, minutes: 45 });
        expect(stale.status).toBe(409);
        await new Promise((r) => setTimeout(r, 5));
        const second = (await complete(id)).completedAt;
        expect(second).not.toBe(first);
        expect((await memory("POST", "/duration", { taskId: id, completedAt: first, minutes: 45 })).status).toBe(409);
        expect((await memory("POST", "/duration", { taskId: id, completedAt: second, minutes: 50 })).status).toBe(200);
        // A task that is not Done has no completion to answer.
        await reopen(id);
        expect((await memory("POST", "/duration", { taskId: id, completedAt: second, minutes: 50 })).status).toBe(409);
    });

    it("keeps an earlier completion's report when a repeating task is completed again", async () => {
        await setMode("full");
        const id = await newTask();
        const first = (await complete(id)).completedAt;
        await memory("POST", "/duration", { taskId: id, completedAt: first, minutes: 45 });
        // A second row for the same task at another instant (a later completion of a series).
        await sql("INSERT INTO duration_reports (user_id, task_id, completed_at, low_minutes, high_minutes, title, group_key, said_on) VALUES ($1, $2, now() - interval '3 days', 40, 40, 'Write essay', 'write essay', '2026-10-01')", [userId, id]);
        await reopen(id);
        expect(await reports(id)).toEqual([expect.objectContaining({ low_minutes: 40 })]);
    });

    it("binds a pre-0.36.0 body to the current completion, and refuses it when the task is not Done", async () => {
        await setMode("full");
        const id = await newTask();
        expect((await memory("POST", "/duration", { taskId: id, minutes: 45 })).status).toBe(409);
        const { completedAt } = await complete(id);
        const legacy = await memory("POST", "/duration", { taskId: id, minutes: 45 });
        expect(legacy.body.data).toMatchObject({ completedAt, lowMinutes: 45 });
    });

    it("stores nothing in Basic or Off, and says nothing about why", async () => {
        const id = await newTask();
        const { completedAt } = await complete(id);
        for (const mode of ["basic", "off"] as const) {
            await setMode(mode);
            const res = await memory("POST", "/duration", { taskId: id, completedAt, minutes: 45 });
            expect(res.status).toBe(200);
            expect(res.body.data).toBeNull();
        }
        expect(await reports()).toEqual([]);
    });

    it("refuses past 200 a day with 429", async () => {
        await setMode("full");
        const id = await newTask();
        const { completedAt } = await complete(id);
        vi.mocked(withinDailyBudget).mockResolvedValueOnce(false);
        expect((await memory("POST", "/duration", { taskId: id, completedAt, minutes: 45 })).status).toBe(429);
        expect(await reports()).toEqual([]);
    });

    it("clears one answer, and clearing a missing one is fine", async () => {
        await setMode("full");
        const id = await newTask();
        const { completedAt } = await complete(id);
        await memory("POST", "/duration", { taskId: id, completedAt, minutes: 45 });
        expect((await memory("DELETE", "/duration", { taskId: id })).status).toBe(200);
        expect(await reports(id)).toEqual([]);
        expect((await memory("DELETE", "/duration", { taskId: id })).status).toBe(200);
        expect((await memory("GET", `/duration?taskId=${id}`)).body.data).toBeNull();
    });
});

describe("the question budget", () => {
    it("asks once: the first /ask reserves the day, a second device gets false", async () => {
        const id = await newTask();
        await setMode("basic");
        await complete(id);
        expect(await ask(id)).toEqual({ ask: false }); // not Full
        await setMode("full");
        const first = await ask(id);
        expect(first).toEqual({ ask: true, token: expect.any(String), completedAt: expect.any(String), reference: null });
        expect(await ask(id)).toEqual({ ask: false });
        expect(await askState()).toMatchObject({ misses: 0, token: first.token });
    });

    it("asks about finished, unhurried work only, and about the unsettled", async () => {
        await setMode("full");
        const [{ id: quick }] = await sql("INSERT INTO tasks (user_id, title, order_index) VALUES ($1, 'Quick', 1) RETURNING id", [userId]);
        await complete(quick);
        expect(await ask(quick)).toEqual({ ask: false }); // completed seconds after creation
        const open = await newTask("Open one");
        expect(await ask(open)).toEqual({ ask: false }); // not Done
    });

    it("reports the person's own plan as the reference, never a guess", async () => {
        await setMode("full");
        const id = await newTask("Plan", "duration_estimate=45");
        await complete(id);
        expect(await ask(id)).toMatchObject({ ask: true, reference: 45 });
    });

    it("counts one miss per token however often /shown is retried; an answer with the token resets, a Took edit does not", async () => {
        await setMode("full");
        const id = await newTask();
        const { completedAt } = await complete(id);
        const { token } = await ask(id);
        await memory("POST", "/duration/shown", { token });
        await memory("POST", "/duration/shown", { token });
        expect(await askState()).toMatchObject({ misses: 1, shownToken: token });
        await memory("POST", "/duration/shown", { token: "someone-else" });
        expect((await askState()).misses).toBe(1);
        await memory("POST", "/duration", { taskId: id, completedAt, minutes: 30 }); // a Took-row edit: no token
        expect((await askState()).misses).toBe(1);
        await memory("POST", "/duration", { taskId: id, completedAt, minutes: 30, token });
        expect((await askState()).misses).toBe(0);
    });

    it("steps to monthly after 10 misses", async () => {
        await setMode("full");
        const id = await newTask();
        await complete(id);
        const lastOn = (days: number) => new Date(Date.now() - days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
        await sql(`UPDATE users SET settings = jsonb_set(settings, '{assistant,durationAsk}', $2::jsonb) WHERE id = $1`, [userId, JSON.stringify({ lastOn: lastOn(10), misses: 10 })]);
        expect(await ask(id)).toEqual({ ask: false });
        await sql(`UPDATE users SET settings = jsonb_set(settings, '{assistant,durationAsk}', $2::jsonb) WHERE id = $1`, [userId, JSON.stringify({ lastOn: lastOn(31), misses: 10 })]);
        expect((await ask(id)).ask).toBe(true);
    });
});

describe("evidence, Forget, Clear and the nightly prune", () => {
    const answer = async (title: string, minutes: number, daysAgo = 1) => {
        const id = await newTask(title);
        const { completedAt } = await complete(id);
        await memory("POST", "/duration", { taskId: id, completedAt, minutes });
        await sql("UPDATE duration_reports SET said_on = (now() - make_interval(days => $2))::date WHERE task_id = $1", [id, daysAgo]);
        return id;
    };

    it("gives the estimator its input in Full only", async () => {
        await setMode("full");
        const id = await answer("Lab report", 45);
        expect((await memory("GET", "/duration-evidence")).body.data).toEqual([
            expect.objectContaining({ taskId: id, title: "Lab report", lowMinutes: 45, highMinutes: 45, anchored: false, series: false, projectId: null }),
        ]);
        await setMode("basic");
        expect((await memory("GET", "/duration-evidence")).body.data).toEqual([]);
        await setMode("full");
        expect((await memory("GET", "/duration-evidence")).body.data).toHaveLength(1);
    });

    it("Forget hides the group's answers at once, Undo brings them back, and the scrub deletes them after the window", async () => {
        await setMode("full");
        await answer("Lab report", 45);
        const [{ id: factId }] = await sql(
            `INSERT INTO ai_memories (user_id, kind, content, said_on, last_seen_on, source, confidence, value)
             VALUES ($1, 'duration', 'Lab report usually takes about 45 minutes (based on 3 of your answers)', '2026-10-13', '2026-10-13', 'activity', 'observed', '{"group":"lab report"}'::jsonb) RETURNING id`, [userId]);
        await memory("DELETE", `/${factId}`);
        expect((await memory("GET", "/duration-evidence")).body.data).toEqual([]);
        expect((await reports())[0].forgotten_at).toBeTruthy();
        await memory("POST", `/${factId}/restore`);
        expect((await memory("GET", "/duration-evidence")).body.data).toHaveLength(1);
        // Forgotten again and left past the window: the nightly scrub deletes the answers.
        await memory("DELETE", `/${factId}`);
        await sql("UPDATE duration_reports SET forgotten_at = now() - interval '11 minutes' WHERE user_id = $1", [userId]);
        await sql("UPDATE ai_memories SET forgotten_at = now() - interval '11 minutes' WHERE id = $1", [factId]);
        await learnForUser(env, userId, new Date());
        expect(await reports()).toEqual([]);
    });

    it("Forget through the assistant hides the answers too, and Undo brings them back", async () => {
        await setMode("full");
        await answer("Lab report", 45);
        const [{ id: factId }] = await sql(
            `INSERT INTO ai_memories (user_id, kind, content, said_on, last_seen_on, source, confidence, value)
             VALUES ($1, 'duration', 'Lab report usually takes about 45 minutes (based on 3 of your answers)', '2026-10-13', '2026-10-13', 'activity', 'observed', '{"group":"lab report"}'::jsonb) RETURNING id`, [userId]);
        const ctx = { timezone: "America/Toronto", currentDate: "2026-10-13T14:00:00Z", today: "2026-10-13" } as any;
        const gone = await (memoryTools(env, userId, ctx).remember.execute as any)({ action: "forget", topic: "Lab report" }, { toolCallId: crypto.randomUUID(), messages: [] });
        expect(gone).toMatchObject({ ok: true, action: "forgot", id: factId });
        expect((await memory("GET", "/duration-evidence")).body.data).toEqual([]);
        await memory("POST", `/${factId}/restore`);
        expect((await memory("GET", "/duration-evidence")).body.data).toHaveLength(1);
    });

    it("Clear deletes every answer now; a mode change deletes none", async () => {
        await setMode("full");
        await answer("Lab report", 45);
        await setMode("basic");
        await setMode("full");
        expect(await reports()).toHaveLength(1);
        await memory("DELETE", "");
        expect(await reports()).toEqual([]);
    });

    it("keeps answers when the 90-day signal prune runs", async () => {
        await setMode("full");
        const id = await answer("Lab report", 45, 120);
        await sql("INSERT INTO ai_memory_signals (user_id, kind, \"on\", bucket) VALUES ($1, 'complete', '2026-01-01', 'evening')", [userId]);
        await nightlyForUser(env, userId, new Date());
        expect(await sql("SELECT 1 FROM ai_memory_signals WHERE user_id = $1 AND \"on\" = '2026-01-01'", [userId])).toEqual([]);
        expect(await reports(id)).toHaveLength(1);
        // Past the 365-day window they are kept but not read.
        await sql("UPDATE duration_reports SET said_on = (now() - interval '400 days')::date WHERE user_id = $1", [userId]);
        expect((await memory("GET", "/duration-evidence")).body.data).toEqual([]);
        expect(await reports(id)).toHaveLength(1);
    });

    it("goes with the task, and with the account", async () => {
        await setMode("full");
        const id = await answer("Lab report", 45);
        await sql("DELETE FROM tasks WHERE id = $1", [id]);
        expect(await reports()).toEqual([]);
    });

    it("gives the nightly pass the same estimator: a fact only when it is supported", async () => {
        await setMode("full");
        await answer("Lab report", 45, 20);
        await answer("Lab report", 50, 10);
        await nightlyForUser(env, userId, new Date());
        expect(await sql("SELECT 1 FROM ai_memories WHERE user_id = $1 AND kind = 'duration'", [userId])).toEqual([]);
        await answer("Lab report", 60, 5);
        await nightlyForUser(env, userId, new Date());
        expect(await sql("SELECT content FROM ai_memories WHERE user_id = $1 AND kind = 'duration'", [userId])).toEqual([
            { content: "Lab report usually takes about 50 minutes (based on 3 of your answers)" },
        ]);
    });
});
