import { describe, expect, it } from "vitest";
import {
    toMinimalTask,
    toMinimalSubtask,
    toMinimalTag,
    toMinimalProject,
    toMinimalSection,
    toMinimalHabit,
    toMinimalInboxItem,
    toMinimalSuggestion,
    resolveDueWindow,
    type TaskRow,
    type HabitRow,
} from "../../src/domains/ai/tools/projections";
import { clampLimit, MAX_LIST_LIMIT } from "../../src/domains/ai/tools/index";

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
    projectId: "p1",
    waitingOn: null,
    content: "SECRET full markdown body that must never be projected",
};

describe("toMinimalTask", () => {
    it("projects only the token-frugal fields and DROPS content", () => {
        const result = toMinimalTask(baseTask);
        expect(result).toEqual({
            id: "t1",
            title: "Write report",
            state: "ACTIVE",
            isAllDay: false,
            dueDate: "2026-06-10T12:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: null,
            durationEstimate: 30,
            priority: 2,
            projectId: "p1",
            waitingOn: null,
        });
        expect(result).not.toHaveProperty("content");
    });
});

describe("toMinimalSubtask / toMinimalTag / toMinimalProject / toMinimalSection", () => {
    it("projects subtasks to id/title/isComplete", () => {
        expect(toMinimalSubtask({ id: "s1", title: "step", isComplete: true })).toEqual({
            id: "s1",
            title: "step",
            isComplete: true,
        });
    });

    it("projects tags to id/name/color", () => {
        expect(toMinimalTag({ id: "g1", name: "urgent", color: "red" })).toEqual({
            id: "g1",
            name: "urgent",
            color: "red",
        });
    });

    it("projects projects to id/name/emoji/accent", () => {
        expect(
            toMinimalProject({ id: "p1", name: "Home", emoji: "🏠", colorAccent: "amber" }),
        ).toEqual({ id: "p1", name: "Home", emoji: "🏠", colorAccent: "amber" });
    });

    it("projects sections to id/name/projectId", () => {
        expect(toMinimalSection({ id: "x1", name: "Doing", projectId: "p1" })).toEqual({
            id: "x1",
            name: "Doing",
            projectId: "p1",
        });
    });
});

describe("toMinimalHabit", () => {
    const habit: HabitRow = {
        id: "h1",
        title: "Meditate",
        recurrenceRule: "FREQ=DAILY",
        targetMode: "AMBIENT",
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
            id: "i1",
            rawText: "call mom tmrw",
            captureKind: "task",
            captureStatus: "clarifying",
            processed: false,
        });
    });
});

describe("toMinimalSuggestion", () => {
    it("drops the free-text body and defaults relatedTaskIds to []", () => {
        const result = toMinimalSuggestion({
            id: "u1",
            type: "move_overdue",
            title: "Move overdue",
            status: "PENDING",
            relatedTaskIds: null,
            body: "long explanation that should not be projected",
        });
        expect(result).toEqual({
            id: "u1",
            type: "move_overdue",
            title: "Move overdue",
            status: "PENDING",
            relatedTaskIds: [],
        });
        expect(result).not.toHaveProperty("body");
    });

    it("preserves provided relatedTaskIds", () => {
        expect(
            toMinimalSuggestion({
                id: "u2",
                type: "lighten_today",
                title: "Lighten",
                status: "PENDING",
                relatedTaskIds: ["t1", "t2"],
            }).relatedTaskIds,
        ).toEqual(["t1", "t2"]);
    });
});

describe("resolveDueWindow", () => {
    const now = "2026-06-05T15:30:00.000Z"; // a Friday

    it("overdue → end is just before start of today, no start bound", () => {
        const w = resolveDueWindow("overdue", now);
        expect(w.start).toBeUndefined();
        expect(w.end).toBe("2026-06-04T23:59:59.999Z");
    });

    it("today → full UTC day bounds", () => {
        expect(resolveDueWindow("today", now)).toEqual({
            start: "2026-06-05T00:00:00.000Z",
            end: "2026-06-05T23:59:59.999Z",
        });
    });

    it("this_week respects Sunday vs Monday week start", () => {
        const sun = resolveDueWindow("this_week", now, "Sunday");
        expect(sun.start).toBe("2026-05-31T00:00:00.000Z"); // Sunday
        const mon = resolveDueWindow("this_week", now, "Monday");
        expect(mon.start).toBe("2026-06-01T00:00:00.000Z"); // Monday
    });

    it("this_month → first to last day of the month", () => {
        expect(resolveDueWindow("this_month", now)).toEqual({
            start: "2026-06-01T00:00:00.000Z",
            end: "2026-06-30T23:59:59.999Z",
        });
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
