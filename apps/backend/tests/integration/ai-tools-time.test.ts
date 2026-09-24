/**
 * The assistant's read tools, run against the real database for a user in
 * Toronto at 10:30 PM on Monday 2026-09-21 — when the UTC date is already the
 * 22nd. "Today" must mean the user's day, and times must read as local.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { userClock } from "../../src/domains/ai/agent";
import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { habitRoutes } from "../../src/domains/habits/habits.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";

const clock = userClock("America/Toronto", "2026-09-22T02:30:00.000Z");

let run: (name: string, args: Record<string, unknown>) => Promise<any>;
let tasks: ReturnType<typeof apiAs>;
let habits: ReturnType<typeof apiAs>;
let notes: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    tasks = apiAs(userId, "/tasks", taskRoutes);
    habits = apiAs(userId, "/habits", habitRoutes);
    notes = apiAs(userId, "/api", noteRoutes);
    const tools = buildToolRegistry({} as any, userId, { timezone: clock.timezone, currentDate: clock.now.toISOString(), today: clock.today, weekStart: "Monday" }) as any;
    run = (name, args) => tools[name].execute(args, { toolCallId: "t", messages: [] });
    // Timed, 9:00 PM Monday local (01:00 UTC Tuesday) — today for the user.
    await tasks("POST", "", { title: "Late call", orderIndex: 1, isAllDay: false, scheduledStart: "2026-09-22T01:00:00.000Z", scheduledEnd: "2026-09-22T01:30:00.000Z" });
    // All-day Monday and all-day Tuesday.
    await tasks("POST", "", { title: "Pay rent", orderIndex: 2, dueDate: "2026-09-21" });
    await tasks("POST", "", { title: "Tomorrow thing", orderIndex: 3, dueDate: "2026-09-22" });
    // Timed, 9:00 AM Tuesday local.
    await tasks("POST", "", { title: "Standup", orderIndex: 4, isAllDay: false, scheduledStart: "2026-09-22T13:00:00.000Z", scheduledEnd: "2026-09-22T13:15:00.000Z" });
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
