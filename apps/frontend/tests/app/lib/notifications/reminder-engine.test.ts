/**
 * §13.2 & §13.3 Acceptance: Reminder engine pipeline tests
 *
 * - Reminder derivation is deterministic
 * - Dismissals and deferrals persist as intended
 * - Quiet hours suppress non-high-priority
 * - Habit bundling works at threshold
 */
import { beforeEach, describe, it, expect } from "vitest";
import { atLocal, dayOf, wallTimeOf } from "@cadence/domain/time";
import { setUserZone } from "../../../../app/lib/utils/user-zone";
import {
    deriveCandidates,
    filterByBehavior,
    applyPresentationRules,
    computeDeferUntil,
    type NotificationDismissalState,
    type BehaviorFilterOptions,
} from "../../../../app/lib/notifications/reminder-engine";
import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import { makeHabit, makeTask } from "../../../helpers";

const BASE_TASK = makeTask({ id: "t1", userId: "u1", title: "Test Task" });
const BASE_HABIT = makeHabit({ id: "h1", userId: "u1", title: "Test Habit" });

const ZONE = "America/Toronto";
/** A wall time on the test day in the user's zone, as the Date the engine takes for "now". */
const at = (time: string, day = "2026-03-26") => new Date(atLocal(day, time, ZONE));
beforeEach(() => setUserZone(ZONE));

const DEFAULT_BEHAVIOR: BehaviorFilterOptions = {
    taskReminders: true,
    habitReminders: true,
    dueDateAlerts: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
};

describe("deriveCandidates", () => {
    it("produces no candidates from empty inputs", () => {
        const now = at("10:00");
        expect(deriveCandidates([], [], now)).toEqual([]);
    });

    it("produces a task-due candidate for a task due today", () => {
        const now = at("10:00");
        const task: Task = {
            ...BASE_TASK,
            dueDate: "2026-03-26",
        };
        const candidates = deriveCandidates([task], [], now);
        expect(candidates.length).toBe(1);
        expect(candidates[0].kind).toBe("task-due");
        expect(candidates[0].priority).toBe("high");
    });

    it("produces an overdue candidate for task due yesterday", () => {
        const now = at("10:00");
        const task: Task = {
            ...BASE_TASK,
            dueDate: "2026-03-25",
        };
        const candidates = deriveCandidates([task], [], now);
        expect(candidates.length).toBe(1);
        expect(candidates[0].kind).toBe("task-due");
        expect(candidates[0].body).toContain("Overdue");
    });

    it("does not produce candidates for completed tasks", () => {
        const now = at("10:00");
        const task: Task = {
            ...BASE_TASK,
            state: "COMPLETE",
            dueDate: "2026-03-26",
        };
        expect(deriveCandidates([task], [], now)).toEqual([]);
    });

    it("produces a task-reminder candidate when reminder is within 1 hour", () => {
        // Both instants in UTC: a local `now` against a UTC reminder only lines up near UTC.
        const now = new Date("2026-03-26T10:00:00.000Z");
        const task: Task = {
            ...BASE_TASK,
            reminderAt: "2026-03-26T10:30:00.000Z",
        };
        const candidates = deriveCandidates([task], [], now);
        expect(candidates.length).toBe(1);
        expect(candidates[0].kind).toBe("task-reminder");
    });
});

describe("filterByBehavior", () => {
    it("suppresses task reminders when preference is off", () => {
        const now = at("10:00");
        const task: Task = {
            ...BASE_TASK,
            reminderAt: "2026-03-26T10:30:00.000Z",
        };
        const candidates = deriveCandidates([task], [], now);
        const filtered = filterByBehavior(candidates, now, {
            ...DEFAULT_BEHAVIOR,
            taskReminders: false,
        });
        expect(filtered.length).toBe(0);
    });

    it("suppresses non-high-priority during quiet hours", () => {
        // 10pm is in quiet hours (22:00 - 07:00)
        const now = at("22:30");
        const habit: Habit = {
            ...BASE_HABIT,
            reminderEnabled: true,
            targetTime: "22:00",
            logs: [{ id: "virt", habitId: "h1", status: "PENDING", targetDate: "2026-03-26", completedAt: null }],
        };
        const candidates = deriveCandidates([], [habit], now);
        const filtered = filterByBehavior(candidates, now, {
            ...DEFAULT_BEHAVIOR,
            quietHoursEnabled: true,
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
        });
        // Habit reminders are "normal" priority — should be suppressed
        expect(filtered.length).toBe(0);
    });

    it("bundles missed habits when count >= threshold", () => {
        // 3pm — targetTime 14:00 was 1hr ago (within ±2hr window), so candidates are generated
        const now = at("15:00");
        const habits: Habit[] = Array.from({ length: 4 }, (_, i) => ({
            ...BASE_HABIT,
            id: `h${i}`,
            title: `Habit ${i}`,
            reminderEnabled: true,
            targetTime: "14:00",
            logs: [{ id: "virt", habitId: `h${i}`, status: "PENDING", targetDate: "2026-03-26", completedAt: null }],
        }));
        const candidates = deriveCandidates([], habits, now);
        expect(candidates.length).toBe(4); // All 4 habits generate candidates
        const filtered = filterByBehavior(candidates, now, {
            ...DEFAULT_BEHAVIOR,
            bundleMissedHabits: true,
            missedHabitBundleThreshold: 3,
        });
        // Should have a single bundled notification
        const bundled = filtered.filter((n) => n.id.startsWith("habit-bundle"));
        expect(bundled.length).toBe(1);
        expect(bundled[0].body).toContain("4 routines");
    });
});

describe("routine reminders", () => {
    const now = at("14:30");
    const routine = (logs: Habit["logs"]): Habit => ({ ...BASE_HABIT, reminderEnabled: true, targetTime: "14:00", logs });
    const log = (status: "PENDING" | "COMPLETED" | "SKIPPED") => [{ id: "l", habitId: "h1", status, targetDate: "2026-03-26", completedAt: null }];

    it("remind only while today's check-in is open (not done, skipped, unscheduled or paused)", () => {
        expect(deriveCandidates([], [routine(log("PENDING"))], now)).toHaveLength(1);
        expect(deriveCandidates([], [routine(log("COMPLETED"))], now)).toHaveLength(0);
        expect(deriveCandidates([], [routine(log("SKIPPED"))], now)).toHaveLength(0);
        expect(deriveCandidates([], [routine([])], now)).toHaveLength(0); // not due today, or paused
    });
});

describe("applyPresentationRules", () => {
    it("filters out dismissed notifications", () => {
        const now = at("10:00");
        const task: Task = {
            ...BASE_TASK,
            dueDate: "2026-03-26",
        };
        const candidates = deriveCandidates([task], [], now);
        const state: NotificationDismissalState = {
            dismissedIds: new Set([candidates[0].id]),
            deferredUntil: new Map(),
        };
        const result = applyPresentationRules(candidates, state, now);
        expect(result.length).toBe(0);
    });

    it("hides deferred notifications until their defer time passes", () => {
        const now = at("10:00");
        const task: Task = {
            ...BASE_TASK,
            dueDate: "2026-03-26",
        };
        const candidates = deriveCandidates([task], [], now);
        const deferUntil = computeDeferUntil("10_minutes", now);
        const state: NotificationDismissalState = {
            dismissedIds: new Set(),
            deferredUntil: new Map([[candidates[0].id, deferUntil]]),
        };

        // Still deferred
        const resultBefore = applyPresentationRules(candidates, state, now);
        expect(resultBefore.length).toBe(0);

        // After defer period, should resurface
        const later = at("10:11");
        const resultAfter = applyPresentationRules(candidates, state, later);
        expect(resultAfter.length).toBe(1);
    });
});

describe("computeDeferUntil", () => {
    it("computes 10_minutes correctly", () => {
        const now = at("10:00");
        const result = computeDeferUntil("10_minutes", now);
        expect(new Date(result).getTime()).toBe(at("10:10").getTime());
    });

    it("this_evening pushes to next day if past 7pm", () => {
        const now = at("20:00");
        const result = computeDeferUntil("this_evening", now);
        expect([dayOf(result, ZONE), wallTimeOf(result, ZONE)]).toEqual(["2026-03-27", "19:00"]);
    });

    it("tomorrow puts at 9am next day", () => {
        const now = at("10:00");
        const result = computeDeferUntil("tomorrow", now);
        expect([dayOf(result, ZONE), wallTimeOf(result, ZONE)]).toEqual(["2026-03-27", "09:00"]);
    });
});

describe("zone-aware behaviour", () => {
    it("treats a deadline as a day: due today at 23:30 local still reads as today, and a timed block is not a deadline", () => {
        const due = makeTask({ id: "d", dueDate: "2026-03-26" });
        const timed = makeTask({ id: "t", scheduledStart: atLocal("2026-03-26", "11:00", ZONE), zone: ZONE });
        const candidates = deriveCandidates([due, timed], [], at("23:30"));
        expect(candidates.map((c) => [c.entityId, c.body])).toEqual([["d", "Due today"]]);
    });

    it("quiet hours read the wall clock in the user's zone", () => {
        const options = { ...DEFAULT_BEHAVIOR, quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" };
        const habit = { ...BASE_HABIT, reminderEnabled: true, targetTime: "22:00", logs: [{ id: "v", habitId: "h1", status: "PENDING" as const, targetDate: "2026-03-26", completedAt: null }] };
        const night = at("22:30");
        expect(filterByBehavior(deriveCandidates([], [habit], night), night, options)).toHaveLength(0);
        const noon = at("12:00");
        expect(filterByBehavior([{ id: "x", kind: "habit-reminder", title: "", body: "", triggerAt: noon.toISOString(), entityId: null, route: null, priority: "normal", read: false }], noon, options)).toHaveLength(1);
    });
});
