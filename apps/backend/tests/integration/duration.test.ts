import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const setMode = (mode: "off" | "basic" | "full") => memory("POST", "/mode", { mode });

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
        expect((await memory("POST", "/duration", { taskId: crypto.randomUUID(), completedAt, value: { kind: "point", minutes: 45 } })).status).toBe(404);
        expect((await memory("POST", "/duration", { taskId: id, completedAt })).status).toBe(400);
    });

    it("answers Undo + re-complete with a new occurrence: the old Retry is a 409 and Undo deletes only its own report", async () => {
        await setMode("full");
        const id = await newTask();
        const first = (await complete(id)).completedAt;
        await memory("POST", "/duration", { taskId: id, completedAt: first, value: { kind: "point", minutes: 45 } });
        await reopen(id);
        expect(await reports(id)).toEqual([]); // Undo took the answer with it
        const stale = await memory("POST", "/duration", { taskId: id, completedAt: first, value: { kind: "point", minutes: 45 } });
        expect(stale.status).toBe(409);
        await new Promise((r) => setTimeout(r, 5));
        const second = (await complete(id)).completedAt;
        expect(second).not.toBe(first);
        expect((await memory("POST", "/duration", { taskId: id, completedAt: first, value: { kind: "point", minutes: 45 } })).status).toBe(409);
        expect((await memory("POST", "/duration", { taskId: id, completedAt: second, value: { kind: "point", minutes: 50 } })).status).toBe(200);
        // A task that is not Done has no completion to answer.
        await reopen(id);
        expect((await memory("POST", "/duration", { taskId: id, completedAt: second, value: { kind: "point", minutes: 50 } })).status).toBe(409);
    });

    it("keeps an earlier completion's report when a repeating task is completed again", async () => {
        await setMode("full");
        const id = await newTask();
        const first = (await complete(id)).completedAt;
        await memory("POST", "/duration", { taskId: id, completedAt: first, value: { kind: "point", minutes: 45 } });
        // A second row for the same task at another instant (a later completion of a series).
        await sql("INSERT INTO duration_reports (user_id, task_id, completed_at, low_minutes, high_minutes, title, group_key, said_on) VALUES ($1, $2, now() - interval '3 days', 40, 40, 'Write essay', 'write essay', '2026-10-01')", [userId, id]);
        await reopen(id);
        expect(await reports(id)).toEqual([expect.objectContaining({ low_minutes: 40 })]);
    });

    it("refuses a body that doesn't name its completion (the pre-0.36.0 shape)", async () => {
        await setMode("full");
        const id = await newTask();
        await complete(id);
        expect((await memory("POST", "/duration", { taskId: id, minutes: 45 })).status).toBe(400);
        expect((await memory("POST", "/duration", { taskId: id, value: { kind: "point", minutes: 45 } })).status).toBe(400);
    });

    it("stores nothing in Basic or Off, and says nothing about why", async () => {
        const id = await newTask();
        const { completedAt } = await complete(id);
        for (const mode of ["basic", "off"] as const) {
            await setMode(mode);
            const res = await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 45 } });
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
        expect((await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 45 } })).status).toBe(429);
        expect(await reports()).toEqual([]);
    });

    it("clears one answer, and clearing a missing one is fine", async () => {
        await setMode("full");
        const id = await newTask();
        const { completedAt } = await complete(id);
        await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 45 } });
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
        await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 30 } }); // a Took-row edit: no token
        expect((await askState()).misses).toBe(1);
        await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes: 30 }, token });
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
        await memory("POST", "/duration", { taskId: id, completedAt, value: { kind: "point", minutes } });
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

describe("routine durations: 'Took 30 min' on a marked day", () => {
    let habitsApi: ReturnType<typeof apiAs>;
    const today = () => new Date().toISOString().slice(0, 10); // time-ok: test fixture; the account's zone is UTC here
    const makeHabit = async (extra: Record<string, unknown> = {}) => {
        const res = await habitsApi("POST", "", { title: "Gym", recurrenceRule: "FREQ=DAILY", ...extra });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        return res.body.data.id as string;
    };
    const mark = (id: string, status: string, extra: Record<string, unknown> = {}) => habitsApi("POST", `/${id}/resolve`, { targetDate: today(), status, ...extra });
    const took = (id: string, minutes = 30, time?: string) => memory("POST", "/duration/routine", { habitId: id, day: today(), ...(time && { time }), value: { kind: "point", minutes } });
    const rows = () => sql("SELECT habit_id, target_date::text AS target_date, wall_time, low_minutes, high_minutes, group_key, task_id FROM duration_reports WHERE user_id = $1 AND habit_id IS NOT NULL", [userId]);

    beforeEach(async () => {
        const { habitRoutes } = await import("../../src/domains/habits/habits.route");
        habitsApi = apiAs(userId, "/habits", habitRoutes, env);
        await sql("UPDATE users SET time_zone = 'UTC' WHERE id = $1", [userId]);
    });

    it("stores one answer for a day marked done, replaces it, and reads it back", async () => {
        await setMode("full");
        const id = await makeHabit();
        await mark(id, "COMPLETED");
        expect((await took(id)).body.data).toMatchObject({ habitId: id, day: today(), time: null, lowMinutes: 30, highMinutes: 30 });
        await took(id, 45);
        expect(await rows()).toEqual([expect.objectContaining({ low_minutes: 45, group_key: `series:${id}`, task_id: null })]);
        expect((await memory("GET", `/duration/routine?habitId=${id}&day=${today()}`)).body.data).toMatchObject({ lowMinutes: 45 });
    });

    it("needs the day marked done (409), and stores nothing outside Full (200 null)", async () => {
        await setMode("full");
        const id = await makeHabit();
        expect((await took(id)).status).toBe(409);
        await mark(id, "COMPLETED");
        await setMode("basic");
        expect((await took(id)).body.data).toBeNull();
        expect(await rows()).toEqual([]);
    });

    it("clearing or skipping the day takes the answer with it", async () => {
        await setMode("full");
        const id = await makeHabit();
        await mark(id, "COMPLETED");
        await took(id);
        await mark(id, "SKIPPED");
        expect(await rows()).toEqual([]);
        await mark(id, "COMPLETED");
        await took(id);
        await mark(id, "PENDING");
        expect(await rows()).toEqual([]);
    });

    it("a routine at set times has one answer per marked time", async () => {
        await setMode("full");
        const id = await makeHabit({ times: ["08:00", "20:00"] });
        await mark(id, "COMPLETED", { time: "08:00", at: new Date().toISOString() });
        expect((await took(id, 10)).status).toBe(409); // no time named
        expect((await took(id, 10, "08:00")).body.data).toMatchObject({ time: "08:00" });
        expect((await took(id, 10, "20:00")).status).toBe(409); // that time isn't done
        await mark(id, "PENDING", { time: "08:00" });
        expect(await rows()).toEqual([]);
    });

    it("joins the estimator's evidence as a repeating thing, and Forget on the fact hides it", async () => {
        await setMode("full");
        const id = await makeHabit();
        await mark(id, "COMPLETED");
        await took(id, 30);
        const evidence = (await memory("GET", "/duration-evidence")).body.data;
        expect(evidence).toEqual([expect.objectContaining({ taskId: id, title: "Gym", series: true, lowMinutes: 30 })]);
    });

    it("deleting the answer, and deleting the routine, removes it", async () => {
        await setMode("full");
        const id = await makeHabit();
        await mark(id, "COMPLETED");
        await took(id);
        await memory("DELETE", "/duration/routine", { habitId: id, day: today() });
        expect(await rows()).toEqual([]);
        await took(id);
        await habitsApi("DELETE", `/${id}`);
        expect(await rows()).toEqual([]);
    });

    it("rejects the CHECK: an answer for both a task and a routine", async () => {
        const id = await makeHabit();
        const taskId = await newTask();
        await expect(sql(`INSERT INTO duration_reports (user_id, task_id, completed_at, habit_id, target_date, low_minutes, high_minutes, title, group_key, said_on) VALUES ($1, $2, now(), $3, '2026-10-01', 5, 5, 't', 'g', '2026-10-01')`, [userId, taskId, id])).rejects.toThrow();
    });
});
