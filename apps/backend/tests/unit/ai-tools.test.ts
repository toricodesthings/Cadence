import { describe, expect, it } from "vitest";
import { asSchema } from "ai";
import {
    toMinimalTask,
    toMinimalHabit,
    toMinimalInboxItem,
    resolveDueWindow,
    taskLocalDay,
    type TaskRow,
    type HabitRow,
} from "../../src/domains/ai/tools/projections";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildToolRegistry, clampLimit, MAX_LIST_LIMIT } from "../../src/domains/ai/tools/index";

const baseTask: TaskRow = {
    id: "t1",
    title: "Write report",
    state: "ACTIVE",
    isAllDay: false,
    dueDate: "2026-06-10T12:00:00.000Z",
    scheduledStart: null,
    scheduledEnd: null,
    durationEstimate: 30,
    priority: 2,
    effort: 3,
    projectId: "p1",
    waitingOn: null,
    interactionMode: "task",
    recurrenceRule: null,
    content: "SECRET full markdown body that must never be projected",
};

describe("toMinimalTask", () => {
    it("projects only the set fields: DROPS content, nulls, defaults and isAllDay", () => {
        expect(Object.keys(toMinimalTask(baseTask, "UTC")).sort()).toEqual(
            ["dueDate", "durationEstimate", "effort", "id", "priority", "projectId", "state", "title"],
        );
        expect(toMinimalTask({ ...baseTask, priority: 0, effort: null, projectId: null, durationEstimate: null, dueDate: null }, "UTC"))
            .toEqual({ id: "t1", title: "Write report", state: "ACTIVE" });
    });

    it("flags timetable blocks and repeats, and names an occurrence by its series id", () => {
        const occurrence = {
            ...baseTask,
            id: "t1::2026-06-10T18:00:00.000Z",
            seriesId: "t1",
            interactionMode: "timetable",
            recurrenceRule: "FREQ=WEEKLY",
        };
        expect(toMinimalTask(occurrence, "UTC")).toMatchObject({ id: "t1", fixedBlock: true, repeats: true });
        expect(toMinimalTask(baseTask, "UTC")).not.toHaveProperty("fixedBlock");
        expect(toMinimalTask(baseTask, "UTC")).not.toHaveProperty("repeats");
    });

    it("writes timed values as the user's wall clock with offset, so the model never converts", () => {
        const task = { ...baseTask, scheduledStart: "2026-06-10T18:00:00.000Z", scheduledEnd: "2026-06-10T19:30:00.000Z" };

        expect(toMinimalTask(task, "America/Toronto")).toMatchObject({
            scheduledStart: "2026-06-10T14:00:00-04:00",
            scheduledEnd: "2026-06-10T15:30:00-04:00",
            dueDate: "2026-06-10T08:00:00-04:00",
        });
    });

    it("writes all-day values as the stored calendar date, in any zone", () => {
        const task = { ...baseTask, isAllDay: true, dueDate: "2026-06-10T12:00:00.000Z", scheduledEnd: "2026-06-12T23:59:59.999Z" };

        for (const tz of ["Pacific/Auckland", "America/Los_Angeles"]) {
            expect(toMinimalTask(task, tz)).toMatchObject({ dueDate: "2026-06-10", scheduledEnd: "2026-06-12" });
            expect(toMinimalTask(task, tz)).not.toHaveProperty("scheduledStart");
        }
    });
});

describe("taskLocalDay", () => {
    it("puts a timed task on the day its start has in the user's zone", () => {
        const lateEvening = { isAllDay: false, dueDate: null, scheduledStart: "2026-06-11T02:30:00.000Z" }; // 22:30 on the 10th in Toronto

        expect(taskLocalDay(lateEvening, "America/Toronto")).toBe("2026-06-10");
        expect(taskLocalDay(lateEvening, "UTC")).toBe("2026-06-11");
    });

    it("keeps an all-day task on its stored date in every zone, and is null when undated", () => {
        const allDay = { isAllDay: true, dueDate: "2026-06-10T12:00:00.000Z", scheduledStart: null };

        expect(taskLocalDay(allDay, "Pacific/Kiritimati")).toBe("2026-06-10");
        expect(taskLocalDay(allDay, "Pacific/Pago_Pago")).toBe("2026-06-10");
        expect(taskLocalDay({ isAllDay: true, dueDate: null, scheduledStart: null }, "UTC")).toBeNull();
    });
});

describe("toMinimalHabit", () => {
    const habit: HabitRow = {
        id: "h1",
        title: "Meditate",
        recurrenceRule: "FREQ=DAILY",
        currentStreak: 4,
        longestStreak: 12,
        totalCompletions: 30,
        totalSkips: 10,
        archived: false,
        pausedUntil: null,
    };

    it("derives adherence = completions / (completions + skips), 2dp", () => {
        expect(toMinimalHabit(habit, "2026-06-05").adherence).toBe(0.75);
    });

    it("returns adherence 0 when there is no resolved history", () => {
        const fresh = { ...habit, totalCompletions: 0, totalSkips: 0 };
        expect(toMinimalHabit(fresh, "2026-06-05").adherence).toBe(0);
    });

    it("flags paused when currentDate is on/before pausedUntil", () => {
        expect(toMinimalHabit({ ...habit, pausedUntil: "2026-06-10" }, "2026-06-05").paused).toBe(true);
        expect(toMinimalHabit({ ...habit, pausedUntil: "2026-06-01" }, "2026-06-05").paused).toBe(false);
        expect(toMinimalHabit({ ...habit, pausedUntil: "2026-06-05" }, "2026-06-05T09:00Z").paused).toBe(true);
    });

    it("does not leak completion/skip raw counts in the projection", () => {
        const result = toMinimalHabit(habit, "2026-06-05");
        expect(result).not.toHaveProperty("totalCompletions");
        expect(result).not.toHaveProperty("totalSkips");
    });
});

describe("toMinimalInboxItem", () => {
    it("keeps rawText and capture status, projects shape", () => {
        expect(
            toMinimalInboxItem({
                id: "i1",
                rawText: "call mom tmrw",
                captureKind: "task",
                captureStatus: "clarifying",
                processed: false,
            }),
        ).toEqual({
            isNote: false,
            id: "i1",
            rawText: "call mom tmrw",
            captureKind: "task",
            captureStatus: "clarifying",
            processed: false,
        });
    });
});

describe("tool registry", () => {
    it("every backend tool has a frontend descriptor, and the frontend lists no removed tool", () => {
        const backend = Object.keys(buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" })).sort();
        const registry = readFileSync(join(__dirname, "../../../frontend/app/components/assistant/tool-registry.tsx"), "utf8");
        const frontend = [...registry.matchAll(/^    (\w+): \{/gm)].map((m) => m[1]).sort();

        expect(frontend).toEqual(backend);
    });

    it("sends the model schemas without regex patterns, but still validates calls in full", async () => {
        const tools = buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const schema = asSchema(tools.propose_batch_reschedule.inputSchema);

        expect(JSON.stringify(await schema.jsonSchema)).not.toContain("pattern");
        expect((await schema.validate!({ taskIds: ["not-a-uuid"], targetDate: "2026-10-01" })).success).toBe(false);
        expect((await schema.validate!({ taskIds: ["6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-10-01T14:00" })).success).toBe(false);
        expect((await schema.validate!({ taskIds: ["6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-10-01" })).success).toBe(true);
    });
});

describe("resolveDueWindow (user's local dates)", () => {
    const today = "2026-06-05"; // a Friday

    it.each([
        ["overdue", "Sunday", { to: "2026-06-04" }],
        ["today", "Sunday", { from: "2026-06-05", to: "2026-06-05" }],
        ["this_week", "Sunday", { from: "2026-05-31", to: "2026-06-06" }],
        ["this_week", "Monday", { from: "2026-06-01", to: "2026-06-07" }],
        ["this_month", "Sunday", { from: "2026-06-01", to: "2026-06-30" }],
    ] as const)("%s (week starts %s) → %j", (window, weekStart, expected) => {
        expect(resolveDueWindow(window, today, weekStart)).toEqual(expected);
    });

    it("handles month ends that roll a year", () => {
        expect(resolveDueWindow("this_month", "2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    });
});

describe("clampLimit", () => {
    it("clamps to [1, MAX_LIST_LIMIT] and floors non-integers", () => {
        expect(clampLimit(999)).toBe(MAX_LIST_LIMIT);
        expect(clampLimit(0)).toBe(1);
        expect(clampLimit(-5)).toBe(1);
        expect(clampLimit(12.9)).toBe(12);
    });

    it("uses the fallback when undefined or non-finite", () => {
        expect(clampLimit(undefined)).toBe(20);
        expect(clampLimit(undefined, 50)).toBe(50);
        expect(clampLimit(Number.NaN, 30)).toBe(30);
    });
});
