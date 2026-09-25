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
import { taskDraftSchema } from "../../src/domains/ai/tools/drafts";
import { approvalFor, needsTap } from "../../src/domains/ai/safety/approval";

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
        expect(Object.keys(JSON.parse(JSON.stringify(toMinimalTask(baseTask, "UTC")))).sort()).toEqual(
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
            interactionMode: "timetable" as const,
            recurrenceRule: "FREQ=WEEKLY",
        };
        expect(toMinimalTask(occurrence, "UTC")).toMatchObject({ id: "t1", fixedBlock: true, repeats: true });
        expect(toMinimalTask(baseTask, "UTC").fixedBlock).toBeUndefined();
        expect(toMinimalTask(baseTask, "UTC").repeats).toBeUndefined();
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
            expect(toMinimalTask(task, tz).scheduledStart).toBeUndefined();
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
        // Live tools are `name: { … }` rows; retired names (history only) are `name: "label"`.
        const frontend = [...registry.matchAll(/^    (\w+): \{/gm)].map((m) => m[1]).sort();

        expect(frontend).toEqual(backend);
        expect(backend).toHaveLength(30);
    });

    it("sends the model schemas without regex patterns, but still validates calls in full", async () => {
        const tools = buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const schema = asSchema(tools.reschedule_tasks.inputSchema);

        expect(JSON.stringify(await schema.jsonSchema)).not.toContain("pattern");
        expect((await schema.validate!({ taskIds: ["not-a-uuid"], targetDate: "2026-10-01" })).success).toBe(false);
        expect((await schema.validate!({ taskIds: ["6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-10-01T14:00" })).success).toBe(false);
        expect((await schema.validate!({ taskIds: ["6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-10-01" })).success).toBe(true);
    });

    it("takes only the repeat rules the Routines picker can show", async () => {
        const tools = buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const schema = asSchema(tools.create_habit.inputSchema);
        const ok = async (recurrenceRule: string, targetTime?: string) => (await schema.validate!({ title: "Gym", recurrenceRule, targetTime })).success;
        for (const rule of ["FREQ=DAILY", "FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA"]) expect(await ok(rule)).toBe(true);
        for (const rule of ["FREQ=HOURLY", "FREQ=WEEKLY", "FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO"]) expect(await ok(rule)).toBe(false);
        expect(await ok("FREQ=DAILY", "7:30")).toBe(false);
        expect(await ok("FREQ=DAILY", "07:30")).toBe(true);
    });
});

describe("which calls wait for a tap", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    const approval = (mode: "ask" | "auto" | "full", toolName: string, input: unknown = {}) => approvalFor(mode)({ toolCall: { toolName, input } });

    it("Ask waits on every write but never on reads or capture", () => {
        expect(approval("ask", "create_tag")).toBe("user-approval");
        expect(approval("ask", "get_tasks")).toBeUndefined();
        expect(approval("ask", "capture_to_inbox")).toBeUndefined();
    });

    it("Auto waits on more than 5 tasks, permanent deletes, removed steps and note rewrites", () => {
        expect(approval("auto", "set_task_state", { taskIds: ids(5) })).toBeUndefined();
        expect(approval("auto", "set_task_state", { taskIds: ids(6) })).toBe("user-approval");
        expect(approval("auto", "create_tasks", { tasks: ids(6) })).toBe("user-approval");
        expect(approval("auto", "delete_tasks", { tasks: ids(1) })).toBe("user-approval");
        expect(needsTap("delete_event", { eventId: "e" })).toBe(true);
        expect(needsTap("delete_section", { sectionId: "s" })).toBe(true);
        expect(needsTap("update_event", { eventId: "e", patch: { emoji: "🎂" } })).toBe(false);
        expect(needsTap("edit_subtasks", { add: ["a"] })).toBe(false);
        expect(needsTap("edit_subtasks", { remove: [{ subtaskId: "s" }] })).toBe(true);
        expect(needsTap("update_tasks", { taskIds: ids(1), patch: { appendNote: "more" } })).toBe(false);
        expect(needsTap("update_tasks", { taskIds: ids(1), patch: { note: "rewritten" } })).toBe(true);
    });

    it("Full never waits, even on a permanent delete", () => {
        expect(approval("full", "delete_tasks", { tasks: ids(20) })).toBeUndefined();
    });
});

describe("task drafts", () => {
    const tasksSchema = taskDraftSchema.array().min(1).max(20);
    const draft = { title: "Plan trip", subtasks: Array.from({ length: 30 }, (_, i) => `Step ${i + 1}`) };

    it("take up to 20 tasks of 30 steps each, and no more", () => {
        expect(tasksSchema.safeParse(Array(20).fill(draft)).success).toBe(true);
        expect(tasksSchema.safeParse(Array(21).fill(draft)).success).toBe(false);
        expect(tasksSchema.safeParse([{ ...draft, subtasks: [...draft.subtasks, "One more"] }]).success).toBe(false);
    });

    it("keep quotes for known fields and drop others without failing the call", () => {
        const parsed = taskDraftSchema.parse({ title: "Pay rent", note: "Amouage", fromImage: { note: "Amouage", project: "Home" } });
        expect(parsed.fromImage).toEqual({ note: "Amouage" });
        expect(taskDraftSchema.safeParse({ title: "Pay rent", fromImage: { subtasks: "x".repeat(300) } }).success).toBe(true);
        expect(taskDraftSchema.safeParse({ title: "Pay rent", fromImage: { dueDate: "x".repeat(301) } }).success).toBe(false);
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
