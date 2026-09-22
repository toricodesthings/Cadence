/**
 * The assistant's read tools, run against the real database for a user in
 * Toronto at 10:30 PM on Monday 2026-09-21 — when the UTC date is already the
 * 22nd. "Today" must mean the user's day, and times must read as local.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { userClock } from "../../src/domains/ai/agent";
import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

const clock = userClock("America/Toronto", "2026-09-22T02:30:00.000Z");

let run: (name: string, args: Record<string, unknown>) => Promise<any>;
let tasks: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    const userId = await createUser();
    tasks = apiAs(userId, "/tasks", taskRoutes);
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
