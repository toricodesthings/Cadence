/**
 * The assistant's read tools, run against the real database for a user in
 * Toronto at 10:30 PM on Monday 2026-09-21 — when the UTC date is already the
 * 22nd. "Today" must mean the user's day, and times must read as local.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import { addDays } from "@cadence/domain/time";
import { apiAs } from "../helpers/app";
import { asOwner, startTestDb } from "../helpers/db";
import { createUserIn } from "../helpers/zone";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { loadSnapshot, userClock } from "../../src/domains/ai/agent";
import { serveMcp } from "../../src/domains/mcp/server";
import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { habitRoutes } from "../../src/domains/habits/habits.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";

const clock = userClock("America/Toronto", "2026-09-22T02:30:00.000Z");

let run: (name: string, args: Record<string, unknown>) => Promise<any>;
let snapshot: () => Promise<string>;
let tasks: ReturnType<typeof apiAs>;
let habits: ReturnType<typeof apiAs>;
let notes: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUserIn("America/Toronto");
    tasks = apiAs(userId, "/tasks", taskRoutes);
    habits = apiAs(userId, "/habits", habitRoutes);
    notes = apiAs(userId, "/api", noteRoutes);
    const tools = buildToolRegistry({} as any, userId, { timezone: clock.timezone, currentDate: clock.now.toISOString(), today: clock.today, weekStart: "Monday" }) as any;
    run = (name, args) => tools[name].execute(args, { toolCallId: "t", messages: [] });
    snapshot = () => loadSnapshot(tools, clock.today);
    // Timed, 9:00 PM Monday local (01:00 UTC Tuesday) — today for the user.
    await tasks("POST", "", { title: "Late call", orderIndex: 1, scheduledStart: "2026-09-22T01:00:00.000Z", scheduledEnd: "2026-09-22T01:30:00.000Z" });
    // All-day Monday and all-day Tuesday.
    await tasks("POST", "", { title: "Pay rent", orderIndex: 2, dueDate: "2026-09-21" });
    await tasks("POST", "", { title: "Tomorrow thing", orderIndex: 3, dueDate: "2026-09-22" });
    // Timed, 9:00 AM Tuesday local.
    await tasks("POST", "", { title: "Standup", orderIndex: 4, scheduledStart: "2026-09-22T13:00:00.000Z", scheduledEnd: "2026-09-22T13:15:00.000Z" });
});

const titles = (list: any[]) => list.map((t) => t.title).sort();

describe("assistant tools use the user's day and clock", () => {
    it("get_tasks 'today' returns Monday's tasks for the user, not the UTC day's", async () => {
        const result = await run("get_tasks", { dueWindow: "today", limit: 20 });

        expect(titles(result.tasks)).toEqual(["Late call", "Pay rent"]);
    });

    it("shows timed tasks in local time with offset, and all-day tasks as plain dates", async () => {
        const result = await run("get_tasks", { dueWindow: "today", limit: 20 });
        const byTitle = Object.fromEntries(result.tasks.map((t: any) => [t.title, t]));

        expect(byTitle["Late call"]).toMatchObject({ scheduledStart: "2026-09-21T21:00:00-04:00", scheduledEnd: "2026-09-21T21:30:00-04:00" });
        expect(byTitle["Pay rent"].dueDate).toBe("2026-09-21");
    });

    it("get_tasks 'overdue' excludes today's timed task that is past midnight UTC", async () => {
        const result = await run("get_tasks", { dueWindow: "overdue", limit: 20 });

        expect(titles(result.tasks)).toEqual([]);
    });

    it("get_schedule_window for the user's Tuesday returns Tuesday's tasks only", async () => {
        const result = await run("get_schedule_window", { start: "2026-09-22", end: "2026-09-22", limit: 50 });

        expect(result.range).toEqual({ start: "2026-09-22", end: "2026-09-22", timezone: "America/Toronto" });
        expect(titles(result.tasks)).toEqual(["Standup", "Tomorrow thing"]);
    });

    it("the prompt snapshot is the user's Monday, read through the same tools", async () => {
        const result = JSON.parse(await snapshot());

        expect(titles(result.schedule.tasks)).toEqual(["Late call", "Pay rent"]);
        expect(result.overdue.tasks).toEqual([]);
        expect(result.routines).toEqual([]);
        expect(result.capture.items).toEqual([]);
    });
});

describe("assistant reads leave out what isn't on the user's plate", () => {
    it("a done task and a trashed task dated yesterday are neither overdue nor in the window", async () => {
        for (const [title, state] of [["Done thing", "COMPLETE"], ["Trashed thing", "ARCHIVED"]] as const) {
            const { body } = await tasks("POST", "", { title, orderIndex: 9, dueDate: "2026-09-20" });
            await tasks("PATCH", `/${body.data.id}`, { state });
        }

        expect(titles((await run("get_tasks", { dueWindow: "overdue", limit: 20 })).tasks)).toEqual([]);
        expect(titles((await run("get_schedule_window", { start: "2026-09-20", end: "2026-09-20", limit: 50 })).tasks)).toEqual([]);
        expect(titles((await run("get_schedule_window", { start: "2026-09-20", end: "2026-09-20", includeDone: true, limit: 50 })).tasks))
            .toEqual(["Done thing"]);
    });

    it("a repeating series that started in the past isn't overdue", async () => {
        await tasks("POST", "", { title: "Water plants", orderIndex: 9, dueDate: "2026-09-01", recurrenceRule: "FREQ=DAILY" });

        expect(titles((await run("get_tasks", { dueWindow: "overdue", limit: 20 })).tasks)).toEqual([]);
    });

    it("lists a Mon/Wed routine only on its days, and not while paused", async () => {
        const gym = (await habits("POST", "", { title: "Gym", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE" })).body.data;
        await asOwner((pg) => pg.query("UPDATE habits SET created_at = '2026-09-01T00:00:00Z' WHERE id = $1", [gym.id]));

        expect((await run("get_schedule_window", { start: "2026-09-22", end: "2026-09-22", limit: 50 })).routines).toEqual([]);
        expect((await run("get_schedule_window", { start: "2026-09-21", end: "2026-09-24", limit: 50 })).routines)
            .toEqual([{ id: gym.id, title: "Gym", days: ["2026-09-21", "2026-09-23"], targetTime: null }]);
        expect((await run("get_habit_status_today", {})).statuses).toEqual([{ habitId: gym.id, title: "Gym", status: "PENDING" }]);

        await habits("PATCH", `/${gym.id}`, { pausedUntil: "2026-09-21" });
        expect((await run("get_habit_status_today", {})).statuses).toEqual([]);
    });

    it("get_task_detail reads the note the panel shows, fenced, with its version and a truncation flag", async () => {
        const task = (await tasks("POST", "", { title: "Essay", orderIndex: 9, content: "old content" })).body.data;
        expect((await run("get_task_detail", { taskId: task.id })).note).toMatchObject({ truncated: false, version: 0 });

        await notes("PATCH", `/tasks/${task.id}/note`, { body: "x".repeat(1_200) });
        const { note } = await run("get_task_detail", { taskId: task.id });

        expect(note).toMatchObject({ truncated: true, version: 1 });
        expect(note.text).toMatch(/^<<<CADENCE_DATA_\w+ kind="note" trust="untrusted">>>\nx{1000}\n<<<END_CADENCE_DATA_\w+>>>$/);
    });
});

// ── One day on every surface (plan 0.26.3 §6.2) ─────────────────────────────

describe("the same fixtures land on the same day on every surface", () => {
    const ZONE = "America/Toronto";
    let userId: string;
    let rest: ReturnType<typeof apiAs>;
    let post: (body: object) => Promise<any>;

    beforeEach(async () => {
        userId = await createUserIn(ZONE);
        rest = apiAs(userId, "/tasks", taskRoutes);
        post = async (body) => (await rest("POST", "", { orderIndex: 1, ...body })).body.data;
    });
    afterEach(() => vi.useRealTimers());

    /** The assistant's tools for a user whose clock reads `nowIso`, built the way the route builds them (zone from users.time_zone). */
    const assistant = (nowIso: string) => {
        const c = userClock(ZONE, nowIso);
        const tools = buildToolRegistry({} as any, userId, { timezone: c.timezone, currentDate: c.now.toISOString(), today: c.today, weekStart: "Sunday" }) as any;
        return {
            today: c.today,
            run: (name: string, args: Record<string, unknown>) => tools[name].execute(args, { toolCallId: "t", messages: [] }),
            snapshot: async () => JSON.parse(await loadSnapshot(tools, c.today)),
        };
    };
    const restDay = async (from: string, to = from) => (await rest("GET", `?from=${from}&to=${to}`)).body.data as any[];
    const names = (rows: { title: string }[]) => [...new Set(rows.map((r) => r.title))].sort();

    /** A one-off all-day task (the COMP3000 case) and a timed block at 11:30 PM local, both on Monday 2026-10-05. */
    const mondayFixtures = async () => {
        await post({ title: "COMP3000 assignment", dueDate: "2026-10-05" });
        await post({ title: "Late block", scheduledStart: "2026-10-05T23:30:00-04:00", scheduledEnd: "2026-10-06T00:15:00-04:00" });
    };

    it.each([
        ["11:30 PM local, still Monday in Toronto but already Tuesday in UTC", "2026-10-06T03:30:00Z", "2026-10-05"],
        ["12:30 AM local, Tuesday", "2026-10-06T04:30:00Z", "2026-10-06"],
    ])("%s: today is %s on REST, get_tasks, the schedule window and the snapshot", async (_label, nowIso, today) => {
        await mondayFixtures();
        const ai = assistant(nowIso);
        expect(ai.today).toBe(today);
        const onMonday = ["COMP3000 assignment", "Late block"];
        const expectedToday = today === "2026-10-05" ? onMonday : [];

        expect(names(await restDay(today))).toEqual(expectedToday);
        expect(names((await ai.run("get_tasks", { dueWindow: "today", limit: 20 })).tasks)).toEqual(expectedToday);
        expect(names((await ai.run("get_schedule_window", { start: today, end: today, limit: 50 })).tasks)).toEqual(expectedToday);
        expect(names((await ai.snapshot()).schedule.tasks)).toEqual(expectedToday);

        // Monday itself reads the same everywhere, whatever the clock says.
        expect(names(await restDay("2026-10-05"))).toEqual(onMonday);
        expect(names((await ai.run("get_tasks", { from: "2026-10-05", to: "2026-10-05", limit: 20 })).tasks)).toEqual(onMonday);
        expect(names((await ai.run("get_schedule_window", { start: "2026-10-05", end: "2026-10-05", limit: 50 })).tasks)).toEqual(onMonday);

        // Overdue is "dated before the user's today": the same set REST gives for effectiveOnOrBeforeDate.
        const overdue = today === "2026-10-05" ? [] : onMonday;
        expect(names((await ai.run("get_tasks", { dueWindow: "overdue", limit: 20 })).tasks)).toEqual(overdue);
        const upTo = (await rest("GET", `?effectiveOnOrBeforeDate=${addDays(today, -1)}`)).body.data;
        expect(names(upTo)).toEqual(overdue);
        expect(names((await ai.snapshot()).overdue.tasks)).toEqual(overdue);
    });

    it("MCP get_today agrees at 11:30 PM and 12:30 AM local", async () => {
        await mondayFixtures();
        const connectionId = crypto.randomUUID();
        await asOwner((pg) => pg.query(
            "INSERT INTO mcp_connections (id, user_id, client_id, client_name, redirect_uri, scopes) VALUES ($1, $2, 'c', 'Claude', 'https://claude.ai/cb', $3)",
            [connectionId, userId, ["cadence:read"]],
        ));
        const today = async (nowIso: string) => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date(nowIso));
            const response = await serveMcp(
                new Request("http://localhost:8787/mcp", {
                    method: "POST",
                    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_today", arguments: {} } }),
                }),
                {} as never,
                { props: { userId, connectionId }, auth: { scope: ["cadence:read"] }, waitUntil: () => {} } as never,
            );
            vi.useRealTimers();
            const raw = await response.text();
            const json = raw.startsWith("{") ? raw : raw.split("\n").find((line) => line.startsWith("data: "))!.slice(6);
            return JSON.parse(JSON.parse(json).result.content[0].text);
        };

        const late = await today("2026-10-06T03:30:00Z");
        expect(late).toMatchObject({ today: "2026-10-05", timezone: ZONE });
        expect(names(late.schedule.tasks)).toEqual(["COMP3000 assignment", "Late block"]);
        const early = await today("2026-10-06T04:30:00Z");
        expect(early).toMatchObject({ today: "2026-10-06" });
        expect(early.schedule.tasks).toEqual([]);
        expect(names(early.overdue.tasks)).toEqual(["COMP3000 assignment", "Late block"]);
    });

    it("blocks at 12:30 AM and 11:30 PM on the 25-hour day (2026-11-01) stay on it, and a weekly 14:35 class holds its local time across it", async () => {
        await post({ title: "Early", scheduledStart: "2026-11-01T00:30:00-04:00", scheduledEnd: "2026-11-01T01:00:00-04:00" });
        await post({ title: "Late", scheduledStart: "2026-11-01T23:30:00-05:00", scheduledEnd: "2026-11-02T00:00:00-05:00" });
        await post({ title: "Day before", scheduledStart: "2026-10-31T23:30:00-04:00" });
        await post({ title: "Day after", scheduledStart: "2026-11-02T00:30:00-05:00" });
        // Thursdays 14:35 Toronto, first on Oct 29 (EDT); Nov 5 is EST.
        const lecture = await post({
            title: "COMP3005 lecture", scheduledStart: "2026-10-29T14:35:00-04:00", scheduledEnd: "2026-10-29T15:55:00-04:00",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TH", interactionMode: "timetable",
        });
        const ai = assistant("2026-11-01T15:00:00Z");

        const fall = await restDay("2026-11-01");
        expect(names(fall)).toEqual(["Early", "Late"]);
        expect(names((await ai.run("get_schedule_window", { start: "2026-11-01", end: "2026-11-01", limit: 50 })).tasks)).toEqual(["Early", "Late"]);
        expect(names((await ai.run("get_tasks", { from: "2026-11-01", to: "2026-11-01", limit: 20 })).tasks)).toEqual(["Early", "Late"]);

        // The series reads in local time with the offset; the REST instants are covered in tasks.test.
        const window = (await ai.run("get_schedule_window", { start: "2026-10-26", end: "2026-11-08", limit: 50 })).tasks
            .filter((t: any) => t.title === "COMP3005 lecture");
        expect(window.map((t: any) => [t.id, t.scheduledStart, t.scheduledEnd])).toEqual([
            [lecture.id, "2026-10-29T14:35:00-04:00", "2026-10-29T15:55:00-04:00"],
            [lecture.id, "2026-11-05T14:35:00-05:00", "2026-11-05T15:55:00-05:00"],
        ]);
    });

    it("a time sent as a deadline is refused by the assistant's schema with a way forward, and a day plus a reminder is stored as given", async () => {
        const ai = assistant("2026-10-05T16:00:00Z");
        const create = asSchema(buildToolRegistry({} as any, userId, { timezone: ZONE, currentDate: "2026-10-05T16:00:00Z", today: "2026-10-05" }).create_tasks.inputSchema as any);
        const refused = await create.validate!({ tasks: [{ title: "Essay", dueDate: "2026-10-09T23:59:00-04:00" }] }) as any;
        expect(refused.success).toBe(false);
        expect(String(refused.error?.message)).toMatch(/reminderAt/);

        const { created } = await ai.run("create_tasks", { tasks: [{ title: "Essay", dueDate: "2026-10-09", reminderAt: "2026-10-09T20:00:00-04:00" }] });
        const task = (await rest("GET", `/${created[0].taskId}`)).body.data;
        expect(task).toMatchObject({ dueDate: "2026-10-09", scheduledStart: null, reminderAt: "2026-10-10T00:00:00.000Z" });
        expect(names(await restDay("2026-10-09"))).toEqual(["Essay"]);
        expect(names((await ai.run("get_tasks", { dueWindow: "this_week", limit: 20 })).tasks)).toContain("Essay");
    });

    it("moving a timed block to another day keeps its local time across the DST change", async () => {
        const klass = await post({ title: "Monday class", scheduledStart: "2026-10-26T14:35:00-04:00", scheduledEnd: "2026-10-26T15:55:00-04:00" });
        const ai = assistant("2026-10-26T12:00:00Z");
        await ai.run("reschedule_tasks", { taskIds: [klass.id], targetDate: "2026-11-02" });

        const moved = (await rest("GET", `/${klass.id}`)).body.data;
        expect(moved).toMatchObject({ scheduledStart: "2026-11-02T19:35:00.000Z", scheduledEnd: "2026-11-02T20:55:00.000Z" }); // 14:35-15:55 EST
    });
});
