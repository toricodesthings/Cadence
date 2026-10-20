/** find_time and the length hints, run as the assistant runs them: a read-only tool, and projections that omit what is absent. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import { memoryRoutes } from "../../src/domains/ai/memory/memory.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

const ZONE = "America/Toronto";
let userId: string;
let run: (name: string, args: Record<string, unknown>) => Promise<any>;
let tasks: ReturnType<typeof apiAs>;
let memory: ReturnType<typeof apiAs>;

const sql = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: ZONE });
    tasks = apiAs(userId, "/tasks", taskRoutes);
    memory = apiAs(userId, "/memory", memoryRoutes);
    const tools = buildToolRegistry({} as any, userId, { timezone: ZONE, currentDate: "2026-10-19T14:00:00.000Z", today: "2026-10-19", weekStart: "Monday" }) as any;
    // What the model receives: JSON, where an absent field is no key at all.
    run = async (name, args) => JSON.parse(JSON.stringify(await tools[name].execute(args, { toolCallId: "t", messages: [] })));
});

describe("find_time", () => {
    it("offers up to 3 spaced gaps on the day, with a buffer around blocks, and changes nothing", async () => {
        const target = (await tasks("POST", "", { title: "Lab report", orderIndex: 1, durationEstimate: 45 })).body.data;
        await tasks("POST", "", { title: "Class", orderIndex: 2, scheduledStart: "2026-10-20T13:00:00.000Z", scheduledEnd: "2026-10-20T14:30:00.000Z", zone: ZONE }); // 9:00–10:30 local
        const before = JSON.stringify((await tasks("GET", `/${target.id}`)).body.data);

        const found = await run("find_time", { taskId: target.id, day: "2026-10-20" });
        expect(found).toMatchObject({ ok: true, task: { id: target.id, minutes: 45 }, day: "2026-10-20" });
        expect(found.proposals).toHaveLength(3);
        expect(found.proposals[0]).toMatchObject({ gap: true, start: "2026-10-20T07:00:00-04:00" });
        expect(found.proposals.every((p: any) => p.label.startsWith("Tue "))).toBe(true);
        for (const p of found.proposals) expect(p.start >= "2026-10-20T07:00" && p.end <= "2026-10-20T22:00").toBe(true);
        expect(JSON.stringify((await tasks("GET", `/${target.id}`)).body.data)).toBe(before);
    });

    it("orders by a time of day they said they like", async () => {
        const target = (await tasks("POST", "", { title: "Study for stats", orderIndex: 1, durationEstimate: 60 })).body.data;
        await memory("POST", "/mode", { mode: "basic" });
        await sql(`INSERT INTO ai_memories (user_id, kind, content, value, said_on, last_seen_on, source, confidence) VALUES ($1, 'preference', 'Studies after dinner', '{"when":{"buckets":["evening"],"about":"study"}}', '2026-10-01', '2026-10-01', 'chat', 'stated')`, [userId]);
        const found = await run("find_time", { taskId: target.id, day: "2026-10-20" });
        expect(found.proposals[0].start).toMatch(/T(17|18|19|20):/);
    });

    it("says so when nothing fits, and refuses a task that isn't an open one-off", async () => {
        const target = (await tasks("POST", "", { title: "Long one", orderIndex: 1, durationEstimate: 1000 })).body.data;
        expect((await run("find_time", { taskId: target.id, day: "2026-10-20" })).proposals).toEqual([]);
        const done = (await tasks("POST", "", { title: "Done", orderIndex: 2, state: "COMPLETE" })).body.data;
        expect(await run("find_time", { taskId: done.id, day: "2026-10-20" })).toMatchObject({ ok: false });
        expect(await run("find_time", { taskId: crypto.randomUUID(), day: "2026-10-20" })).toMatchObject({ ok: false });
        // A day that has passed has no gap to offer.
        expect(await run("find_time", { taskId: target.id, day: "2026-10-18" })).toMatchObject({ ok: false });
    });
});

describe("fit_day", () => {
    it("lays sized untimed tasks into the day's gaps in order, lists the rest, and changes nothing", async () => {
        const essay = (await tasks("POST", "", { title: "Essay", orderIndex: 1, dueDate: "2026-10-19", durationEstimate: 60 })).body.data;
        const email = (await tasks("POST", "", { title: "Email", orderIndex: 2, dueDate: "2026-10-19", durationEstimate: 30 })).body.data;
        const vague = (await tasks("POST", "", { title: "Sort the garage", orderIndex: 3, dueDate: "2026-10-19" })).body.data;
        const huge = (await tasks("POST", "", { title: "Thesis", orderIndex: 4, dueDate: "2026-10-19", durationEstimate: 900 })).body.data;
        const timed = (await tasks("POST", "", { title: "Class", orderIndex: 5, scheduledStart: "2026-10-19T15:00:00.000Z", scheduledEnd: "2026-10-19T16:00:00.000Z", zone: ZONE })).body.data; // 11:00–12:00

        const fit = await run("fit_day", { day: "2026-10-19" });
        expect(fit.ok).toBe(true);
        // Now is 10:00 local: the essay can't sit flush against class, so it goes after it.
        expect(fit.placed.map((p: any) => p.id)).toEqual([essay.id, email.id]);
        expect(fit.placed[0].start).toBe("2026-10-19T12:15:00-04:00");
        expect(fit.didntFit).toEqual([{ id: huge.id, title: "Thesis", minutes: 900 }]);
        expect(fit.notSized).toEqual([{ id: vague.id, title: "Sort the garage" }]);
        expect(fit.placed.some((p: any) => p.id === timed.id)).toBe(false);
        expect((await tasks("GET", `/${essay.id}`)).body.data.scheduledStart).toBeNull();
    });

    it("refuses a day that has passed", async () => {
        expect(await run("fit_day", { day: "2026-10-18" })).toMatchObject({ ok: false });
    });
});

describe("what a task takes, in the assistant's reads", () => {
    const answers = async (title: string, minutes: number[]) => {
        for (const [i, m] of minutes.entries()) {
            const [{ id }] = await sql(`INSERT INTO tasks (user_id, title, order_index, state, created_at) VALUES ($1, $2, 1, 'COMPLETE', now() - interval '3 days') RETURNING id`, [userId, title]);
            await sql(`INSERT INTO duration_reports (user_id, task_id, completed_at, low_minutes, high_minutes, title, group_key, said_on) SELECT $1, id, completed_at, $3, $3, title, 'lab report', ('2026-10-19'::date - $4::int) FROM tasks WHERE id = $2`, [userId, id, m, i]);
        }
    };

    it("shows takesAbout on an open task (Full, a supported guess) and took on a finished one, and omits both otherwise", async () => {
        await memory("POST", "/mode", { mode: "full" });
        await answers("Lab report", [40, 45, 50, 45]);
        const open = (await tasks("POST", "", { title: "Lab report", orderIndex: 1 })).body.data;
        const other = (await tasks("POST", "", { title: "Buy milk", orderIndex: 2 })).body.data;

        const listed = (await run("get_tasks", {})).tasks;
        expect(listed.find((t: any) => t.id === open.id)).toMatchObject({ takesAbout: 45 });
        expect(listed.find((t: any) => t.id === other.id)).not.toHaveProperty("takesAbout");
        expect((await run("get_task_detail", { taskId: open.id })).task.takesAbout).toBe(45);

        const done = (await run("get_tasks", { state: "COMPLETE" })).tasks;
        expect(done.map((t: any) => t.took).sort()).toEqual([40, 45, 45, 50]);

        await memory("POST", "/mode", { mode: "basic" });
        const basic = (await run("get_tasks", {})).tasks;
        expect(basic.some((t: any) => "takesAbout" in t || "took" in t)).toBe(false);
    });

    it("a range answer reads as a range", async () => {
        await memory("POST", "/mode", { mode: "full" });
        await answers("Essay", [30]);
        await sql("UPDATE duration_reports SET high_minutes = 60 WHERE user_id = $1", [userId]);
        expect((await run("get_tasks", { state: "COMPLETE" })).tasks[0].took).toBe("30–60");
    });
});
