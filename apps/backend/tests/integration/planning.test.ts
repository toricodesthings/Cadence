import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, atLocal, todayIn } from "@cadence/domain/time";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
vi.mock("../../src/platform/daily-budget", () => ({ withinDailyBudget: vi.fn(async () => true) }));
vi.mock("../../src/domains/ai/memory/embedding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/domains/ai/memory/embedding")>()),
    embedTexts: async (_env: unknown, texts: string[]) => texts.map((text) => Array.from({ length: 512 }, (_, i) => ((text.charCodeAt(i % text.length) + i) % 7) / 7)),
}));
vi.mock("../../src/domains/ai/memory/consolidate", () => ({ consolidate: async (_e: unknown, _h: string, items: unknown[]) => items.map(() => null) }));

import { memoryRoutes } from "../../src/domains/ai/memory/memory.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { nightlyForUser } from "../../src/domains/ai/memory/nightly";
import { learnForUser } from "../../src/domains/ai/memory/memory-job";

const env = {} as any;
const ZONE = "America/Toronto";
let userId: string;
let memory: ReturnType<typeof apiAs>;
let tasksApi: ReturnType<typeof apiAs>;

const sql = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
const setMode = (mode: "off" | "basic" | "full") => memory("POST", "/mode", { mode });
const tomorrow = () => addDays(todayIn(ZONE), 1);
/** A time tomorrow, so the window is never clamped to "now". */
const at = (time: string, day = tomorrow()) => atLocal(day, time, ZONE);
const newTask = async (title = "Lab report", extra: { project?: string; recurrence?: string } = {}) =>
    (await sql(`INSERT INTO tasks (user_id, title, order_index, project_id, recurrence_rule) VALUES ($1, $2, 1, $3, $4) RETURNING id`, [userId, title, extra.project ?? null, extra.recurrence ?? null]))[0].id as string;
const block = async (start: string, end: string) =>
    sql(`INSERT INTO tasks (user_id, title, order_index, scheduled_start, scheduled_end, zone) VALUES ($1, 'Busy', 1, $2, $3, $4)`, [userId, at(start), at(end), ZONE]);
const drop = (id: string, time: string, minutes = 45, extra: object = {}, headers: Record<string, string> = {}) =>
    tasksApi("PATCH", `/${id}`, { scheduledStart: at(time), scheduledEnd: new Date(Date.parse(at(time)) + minutes * 60_000).toISOString(), zone: ZONE, ...extra }, headers);
const slots = () => sql("SELECT chosen, feasible, suggested, project_id, task_id, said_on::text AS said_on, forgotten_at FROM planning_records WHERE user_id = $1 AND kind = 'slot' ORDER BY created_at", [userId]);

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: ZONE });
    memory = apiAs(userId, "/memory", memoryRoutes, env);
    tasksApi = apiAs(userId, "/tasks", taskRoutes, env);
});

describe("a manual drop onto a time", () => {
    it("is one record when another part of the day also had room", async () => {
        await setMode("full");
        const id = await newTask();
        expect((await drop(id, "19:00")).status).toBe(200);
        expect(await slots()).toEqual([expect.objectContaining({ chosen: "evening", suggested: false, task_id: id })]);
        expect((await slots())[0].feasible).toEqual(expect.arrayContaining(["morning", "afternoon", "evening"]));
    });

    it("writes nothing when the only free time was the one chosen (a shift worker with one gap a day)", async () => {
        await setMode("full");
        await block("06:00", "17:00");
        await block("19:45", "22:00");
        const id = await newTask();
        await drop(id, "17:30");
        expect(await slots()).toEqual([]);
    });

    it("writes nothing for moving a block, a repeating task Basic or Off", async () => {
        await setMode("full");
        const timed = await newTask("Already timed");
        await drop(timed, "09:00");
        expect(await slots()).toHaveLength(1);
        await drop(timed, "19:00"); // moving a block isn't deciding when to start
        expect(await slots()).toHaveLength(1);

        const series = await newTask("Class", { recurrence: "FREQ=WEEKLY;BYDAY=MO" });
        await drop(series, "10:00");
        expect(await slots()).toHaveLength(1);

        for (const mode of ["basic", "off"] as const) {
            await setMode(mode);
            await drop(await newTask(`Task in ${mode}`), "19:00");
        }
        expect(await slots()).toHaveLength(1);
    });

    it("ignores an offline change replayed more than an hour later", async () => {
        await setMode("full");
        await drop(await newTask("Late"), "19:00", 45, {}, { "X-Queued-At": new Date(Date.now() - 2 * 3600_000).toISOString() });
        expect(await slots()).toEqual([]);
        await drop(await newTask("Fresh"), "19:00", 45, {}, { "X-Queued-At": new Date(Date.now() - 5 * 60_000).toISOString() });
        expect(await slots()).toHaveLength(1);
    });
});

describe("a time Cadence proposed (findTime)", () => {
    it("keeping the first proposal teaches nothing; a pick after comparing is one record, replaced by a later pick, deleted by Undo", async () => {
        await setMode("full");
        const id = await newTask();
        await drop(id, "19:00", 45, { findTime: { shown: ["evening"] } });
        expect(await slots()).toEqual([]);

        await drop(id, "09:30", 45, { findTime: { shown: ["evening", "morning"] } });
        expect(await slots()).toEqual([expect.objectContaining({ chosen: "morning", suggested: true })]);
        expect((await slots())[0].feasible.sort()).toEqual(["evening", "morning"]);

        await drop(id, "14:00", 45, { findTime: { shown: ["evening", "morning", "afternoon"] } });
        expect(await slots()).toEqual([expect.objectContaining({ chosen: "afternoon", suggested: true })]);

        await tasksApi("PATCH", `/${id}`, { scheduledStart: null, scheduledEnd: null, findTime: { undo: true } });
        expect(await slots()).toEqual([]);
    });

    it("never writes a manual record, and the body is not stored on the task", async () => {
        await setMode("full");
        const id = await newTask();
        const { body } = await drop(id, "09:30", 45, { findTime: { shown: ["morning"] } });
        expect(body.data).not.toHaveProperty("findTime");
        expect(await slots()).toEqual([]);
    });
});

describe("what Find a time orders by", () => {
    it("returns the person's records in Full and their stated preferences whenever memory is on", async () => {
        await setMode("full");
        await drop(await newTask(), "19:00");
        await sql(`INSERT INTO ai_memories (user_id, kind, content, value, said_on, last_seen_on, source, confidence) VALUES ($1, 'preference', 'Studies after dinner', '{"when":{"buckets":["evening"],"about":"study"}}', '2026-10-01', '2026-10-01', 'chat', 'stated')`, [userId]);
        const full = (await memory("GET", "/planning-evidence")).body.data;
        expect(full.records).toHaveLength(1);
        expect(full.stated).toEqual([{ buckets: ["evening"], about: "study" }]);

        await setMode("basic");
        expect((await memory("GET", "/planning-evidence")).body.data).toMatchObject({ records: [], stated: [{ buckets: ["evening"], about: "study" }] });
        await setMode("off");
        expect((await memory("GET", "/planning-evidence")).body.data).toEqual({ records: [], stated: [] });
    });
});

describe("the pattern and Forget", () => {
    const seed = async () => {
        await setMode("full");
        const today = todayIn(ZONE);
        for (let i = 0; i < 9; i++) {
            await sql(
                `INSERT INTO planning_records (user_id, kind, chosen, feasible, suggested, outcome, said_on) VALUES ($1, 'slot', 'evening', '{morning,afternoon,evening}', false, 'chosen', $2)`,
                [userId, addDays(today, -(i % 5) - 1)],
            );
        }
    };
    const patternFact = async () => (await sql(`SELECT id, content, value, status FROM ai_memories WHERE user_id = $1 AND kind = 'pattern'`, [userId]))[0];

    it("shows 'Often plans things in the evening', and Forget hides the records, Undo restores them, the scrub deletes them, and new choices can teach it again", async () => {
        await seed();
        await nightlyForUser(env, userId);
        const fact = await patternFact();
        expect(fact.content).toMatch(/^Often plans things in the evening \(9 choices since \w+\)$/);

        expect((await memory("DELETE", `/${fact.id}`)).status).toBe(200);
        expect((await memory("GET", "/planning-evidence")).body.data.records).toEqual([]);
        expect((await slots()).every((r: any) => r.forgotten_at)).toBe(true);

        expect((await memory("POST", `/${fact.id}/restore`)).status).toBe(200);
        expect((await memory("GET", "/planning-evidence")).body.data.records).toHaveLength(9);

        await memory("DELETE", `/${fact.id}`);
        await sql("UPDATE ai_memories SET forgotten_at = now() - interval '11 minutes' WHERE id = $1", [fact.id]);
        await sql("UPDATE planning_records SET forgotten_at = now() - interval '11 minutes' WHERE user_id = $1", [userId]);
        await learnForUser(env, userId, new Date());
        expect(await slots()).toEqual([]);
        expect(await patternFact()).toBeUndefined(); // no tombstone

        // Forget is not a switch: choosing again records, and enough new choices bring the pattern back.
        await drop(await newTask("After forget"), "19:00");
        expect(await slots()).toHaveLength(1);
        await seed();
        await nightlyForUser(env, userId);
        expect((await patternFact()).status).toBe("active");
    });

    it("Clear removes the records", async () => {
        await seed();
        await memory("DELETE", "");
        expect(await slots()).toEqual([]);
    });

    it("drops records older than 90 days at night", async () => {
        await setMode("full");
        await sql(`INSERT INTO planning_records (user_id, kind, chosen, feasible, suggested, outcome, said_on) VALUES ($1, 'slot', 'evening', '{morning,evening}', false, 'chosen', $2)`, [userId, addDays(todayIn(ZONE), -100)]);
        await nightlyForUser(env, userId);
        expect(await slots()).toEqual([]);
    });
});

describe("planning offers", () => {
    const slip = async (taskId: string, days: number[]) => {
        for (const d of days) {
            await sql(`INSERT INTO ai_memory_signals (user_id, kind, "on", bucket, task_id) VALUES ($1, 'reschedule', $2, 'monday|day', $3)`, [userId, addDays(todayIn(ZONE), -d), taskId]);
        }
    };
    const offers = async () => (await memory("GET", "/planning/offers")).body.data;

    it("offers Break into steps to a task moved 3 times on 2 days, and Leave for later to a waiting one", async () => {
        await setMode("full");
        const slipping = await newTask("Write thesis");
        await slip(slipping, [1, 1, 3]);
        const waiting = await newTask("Reply from Sam");
        await sql("UPDATE tasks SET state = 'WAITING', waiting_on = 'Sam' WHERE id = $1", [waiting]);
        expect(await offers()).toEqual({ steps: [slipping], later: [waiting] });

        // A step already written, or a deadline this week, takes the offer away.
        await sql("INSERT INTO subtasks (task_id, user_id, title, order_index) VALUES ($1, $2, 'Outline', 1)", [slipping, userId]);
        await sql("UPDATE tasks SET due_on = $2 WHERE id = $1", [waiting, addDays(todayIn(ZONE), 3)]);
        expect(await offers()).toEqual({ steps: [], later: [] });
    });

    it("shows no offer outside Full", async () => {
        const slipping = await newTask("Write thesis");
        await slip(slipping, [1, 1, 3]);
        await setMode("basic");
        expect(await offers()).toEqual({ steps: [], later: [] });
        await setMode("full");
        expect((await offers()).steps).toEqual([slipping]);
    });

    it("Not now silences the offer on that task until its title changes; three on three tasks stop it", async () => {
        await setMode("full");
        const a = await newTask("Alpha");
        await slip(a, [1, 1, 3]);
        await memory("POST", "/planning/offer", { taskId: a, kind: "steps", outcome: "declined" });
        expect((await offers()).steps).toEqual([]);
        await sql("UPDATE tasks SET title = 'Alpha, part one' WHERE id = $1", [a]);
        expect((await offers()).steps).toEqual([a]);

        const others = [await newTask("Beta"), await newTask("Gamma")];
        for (const t of others) await slip(t, [1, 1, 3]);
        await memory("POST", "/planning/offer", { taskId: a, kind: "steps", outcome: "declined" });
        for (const t of others) await memory("POST", "/planning/offer", { taskId: t, kind: "steps", outcome: "declined" });
        const fresh = await newTask("Delta");
        await slip(fresh, [1, 1, 3]);
        expect((await offers()).steps).toEqual([]);
    });

    it("a stated 'steps don't help me' fact stops Break into steps", async () => {
        await setMode("full");
        const a = await newTask("Alpha");
        await slip(a, [1, 1, 3]);
        await sql(`INSERT INTO ai_memories (user_id, kind, content, value, said_on, last_seen_on, source, confidence) VALUES ($1, 'assist', 'Step lists stress them out', '{"avoid":"steps"}', '2026-10-01', '2026-10-01', 'chat', 'stated')`, [userId]);
        expect((await offers()).steps).toEqual([]);
    });

    it("signals now carry the task id of a reschedule", async () => {
        await setMode("full");
        const id = await newTask("Moves", {});
        await sql("UPDATE tasks SET due_on = $2 WHERE id = $1", [id, tomorrow()]);
        await tasksApi("PATCH", `/${id}`, { dueDate: addDays(tomorrow(), 1) });
        expect((await sql("SELECT task_id FROM ai_memory_signals WHERE user_id = $1 AND kind = 'reschedule'", [userId]))[0].task_id).toBe(id);
    });
});
