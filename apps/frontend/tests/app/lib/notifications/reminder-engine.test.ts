/**
 * §13.2 & §13.3 Acceptance: Reminder engine pipeline tests
 *
 * - Reminder derivation is deterministic
 * - Dismissals and deferrals persist as intended
 * - Quiet hours suppress non-high-priority
 * - Habit bundling works at threshold
 */
import { describe, it, expect } from "vitest";
import {
    deriveCandidates,
    filterByBehavior,
    applyPresentationRules,
    computeDeferUntil,
    DEFER_LABELS,
    type DeferChoice,
    type NotificationDismissalState,
    type BehaviorFilterOptions,
} from "../../../../app/lib/notifications/reminder-engine";
import type { Task } from "../../../../app/types/task";
import type { Habit } from "../../../../app/types/habit";

const BASE_TASK: Task = {
    id: "t1",
    userId: "u1",
    title: "Test Task",
    content: null,
    state: "ACTIVE",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    isAllDay: false,
    durationEstimate: null,
    timezoneLocked: false,
    priority: 0 as const,
    isPinned: false,
    reminderAt: null,
    reminderSilenced: false,
    recurrenceRule: null,
    interactionMode: "task" as const,
    effort: null,
    projectId: null,
    sectionId: null,
    orderIndex: 0,
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
};

const BASE_HABIT: Habit = {
    id: "h1",
    userId: "u1",
    title: "Test Habit",
    description: null,
    notes: null,
    recurrenceRule: "FREQ=DAILY",
    targetTime: null,
    reminderEnabled: false,
    totalCompletions: 0,
    totalSkips: 0,
    currentStreak: 0,
    longestStreak: 0,
    colorAccent: "#000",
    archived: false,
    targetMode: "AMBIENT" as const,
    projectId: null,
    sortOrder: 0,
    pausedUntil: null,
    logs: [],
    createdAt: "2026-03-26T00:00:00.000Z",
    updatedAt: "2026-03-26T00:00:00.000Z",
};

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
        const now = new Date("2026-03-26T10:00:00");
        expect(deriveCandidates([], [], now)).toEqual([]);
    });

    it("produces a task-due candidate for a task due today", () => {
        const now = new Date("2026-03-26T10:00:00");
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
        const now = new Date("2026-03-26T10:00:00");
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
        const now = new Date("2026-03-26T10:00:00");
        const task: Task = {
            ...BASE_TASK,
            state: "COMPLETE",
            dueDate: "2026-03-26",
        };
        expect(deriveCandidates([task], [], now)).toEqual([]);
    });

    it("produces a task-reminder candidate when reminder is within 1 hour", () => {
        const now = new Date("2026-03-26T10:00:00");
        const task: Task = {
            ...BASE_TASK,
            reminderAt: "2026-03-26T10:30:00.000Z",
        };
        const candidates = deriveCandidates([task], [], now);
        expect(candidates.length).toBe(1);
        expect(candidates[0].kind).toBe("task-reminder");
    });

    it("produces deterministic output for same inputs", () => {
        const now = new Date("2026-03-26T10:00:00");
        const tasks: Task[] = [
            { ...BASE_TASK, id: "t1", title: "Task A", dueDate: "2026-03-26" },
            { ...BASE_TASK, id: "t2", title: "Task B", dueDate: "2026-03-25" },
        ];
        const a = deriveCandidates(tasks, [], now);
        const b = deriveCandidates(tasks, [], now);
        expect(a).toEqual(b);
    });
});

describe("filterByBehavior", () => {
    it("suppresses task reminders when preference is off", () => {
        const now = new Date("2026-03-26T10:00:00");
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
        const now = new Date("2026-03-26T22:30:00");
        const habit: Habit = {
            ...BASE_HABIT,
            reminderEnabled: true,
            targetTime: "22:00",
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
        const now = new Date("2026-03-26T15:00:00");
        const habits: Habit[] = Array.from({ length: 4 }, (_, i) => ({
            ...BASE_HABIT,
            id: `h${i}`,
            title: `Habit ${i}`,
            reminderEnabled: true,
            targetTime: "14:00",
            logs: [],
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
        expect(bundled[0].body).toContain("4 habits");
    });
});

describe("applyPresentationRules", () => {
    it("filters out dismissed notifications", () => {
        const now = new Date("2026-03-26T10:00:00");
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
        const now = new Date("2026-03-26T10:00:00");
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
        const later = new Date("2026-03-26T10:11:00");
        const resultAfter = applyPresentationRules(candidates, state, later);
        expect(resultAfter.length).toBe(1);
    });
});

describe("computeDeferUntil", () => {
    it("computes 10_minutes correctly", () => {
        const now = new Date("2026-03-26T10:00:00");
        const result = computeDeferUntil("10_minutes", now);
        expect(new Date(result).getTime()).toBe(new Date("2026-03-26T10:10:00").getTime());
    });

    it("this_evening pushes to next day if past 7pm", () => {
        const now = new Date("2026-03-26T20:00:00");
        const result = computeDeferUntil("this_evening", now);
        const d = new Date(result);
        expect(d.getDate()).toBe(27);
        expect(d.getHours()).toBe(19);
    });

    it("tomorrow puts at 9am next day", () => {
        const now = new Date("2026-03-26T10:00:00");
        const result = computeDeferUntil("tomorrow", now);
        const d = new Date(result);
        expect(d.getDate()).toBe(27);
        expect(d.getHours()).toBe(9);
    });
});

describe("DEFER_LABELS", () => {
    it("has labels for all DeferChoice values", () => {
        const choices: DeferChoice[] = ["10_minutes", "this_evening", "tomorrow"];
        for (const choice of choices) {
            expect(DEFER_LABELS[choice]).toBeDefined();
            expect(typeof DEFER_LABELS[choice]).toBe("string");
        }
    });
});
