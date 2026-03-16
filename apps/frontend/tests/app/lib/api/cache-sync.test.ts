import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
    patchHabitMonthlyCache,
    reconcileHabitInCaches,
    reconcileTaskInCaches,
    removeTaskFromCaches,
} from "../../../../app/lib/api/cache-sync";
import { queryKeys } from "../../../../app/lib/api/query-keys";
import type { Habit } from "../../../../app/types/habit";
import type { Task } from "../../../../app/types/task";

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: "task-1",
        userId: "user-1",
        projectId: null,
        title: "Task",
        content: null,
        state: "ACTIVE",
        orderIndex: 1,
        isAllDay: true,
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        durationEstimate: null,
        timezoneLocked: false,
        createdAt: "2026-03-07T00:00:00Z",
        updatedAt: "2026-03-07T00:00:00Z",
        priority: 0,
        isPinned: false,
        reminderAt: null,
        reminderSilenced: false,
        recurrenceRule: null,
        interactionMode: "task",
        sectionId: null,
        seriesId: undefined,
        isRecurringInstance: false,
        occurrenceStart: null,
        occurrenceEnd: null,
        effort: null,
        ...overrides,
    };
}

function createHabit(overrides: Partial<Habit> = {}): Habit {
    return {
        id: "habit-1",
        userId: "user-1",
        title: "Habit",
        description: null,
        notes: null,
        recurrenceRule: "FREQ=DAILY",
        targetTime: null,
        reminderEnabled: false,
        totalCompletions: 0,
        totalSkips: 0,
        currentStreak: 0,
        longestStreak: 0,
        colorAccent: "lantern",
        archived: false,
        createdAt: "2026-03-07T00:00:00Z",
        updatedAt: "2026-03-07T00:00:00Z",
        logs: [],
        ...overrides,
    };
}

describe("api/cache-sync", () => {
    it("reconciles task caches across matching and non-matching lists", () => {
        const queryClient = new QueryClient();
        const activeTask = createTask();
        const waitingTask = createTask({ id: "task-2", state: "WAITING" });
        const holdingTask = createTask({ id: "task-3", projectId: null, dueDate: "2026-03-09" });

        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE" }), [activeTask]);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "WAITING" }), [waitingTask]);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE", hasNoProject: true }), [holdingTask]);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE", effectiveOnOrBeforeDate: "2026-03-09" }), [holdingTask]);
        queryClient.setQueryData(queryKeys.tasks.detail(activeTask.id), activeTask);

        const updated = createTask({ id: activeTask.id, state: "WAITING", title: "Moved task" });
        reconcileTaskInCaches(queryClient, updated);

        expect(queryClient.getQueryData(queryKeys.tasks.detail(activeTask.id))).toEqual(updated);
        expect(queryClient.getQueryData<Task[]>(queryKeys.tasks.list({ state: "ACTIVE" }))).toEqual([]);
        expect(queryClient.getQueryData<Task[]>(queryKeys.tasks.list({ state: "WAITING" }))).toEqual([
            waitingTask,
            updated,
        ]);
        expect(queryClient.getQueryData<Task[]>(queryKeys.tasks.list({ state: "ACTIVE", hasNoProject: true }))).toEqual([
            holdingTask,
        ]);
    });

    it("removes task detail and list cache entries", () => {
        const queryClient = new QueryClient();
        const task = createTask();

        queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE" }), [task]);

        removeTaskFromCaches(queryClient, task.id);

        expect(queryClient.getQueryData(queryKeys.tasks.detail(task.id))).toBeUndefined();
        expect(queryClient.getQueryData(queryKeys.tasks.list({ state: "ACTIVE" }))).toEqual([]);
    });

    it("invalidates task list caches instead of reconciling recurring series inline", async () => {
        const queryClient = new QueryClient();
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
        const recurring = createTask({
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            isAllDay: false,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
        });

        reconcileTaskInCaches(queryClient, recurring);

        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tasks.all });
    });

    it("replaces optimistic habits and patches monthly logs by day", () => {
        const queryClient = new QueryClient();
        const optimistic = createHabit({ id: "temp-1", title: "Optimistic habit" });
        const weekly = createHabit({ id: "temp-1", logs: [{ id: "virt", habitId: "temp-1", targetDate: "2026-03-09T00:00:00.000Z", status: "PENDING", completedAt: null }] });

        queryClient.setQueryData(queryKeys.habits.all, [optimistic]);
        queryClient.setQueryData(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, false], [weekly]);
        queryClient.setQueryData(queryKeys.habits.monthly("habit-1", 2026, 2), {
            scheduledDays: [9],
            logsByDay: { 9: "PENDING" },
        });

        const serverHabit = createHabit({ id: "habit-1", title: "Server habit" });
        reconcileHabitInCaches(queryClient, serverHabit, "temp-1");
        patchHabitMonthlyCache(queryClient, "habit-1", "2026-03-09T00:00:00.000Z", "COMPLETED");

        expect(queryClient.getQueryData<Habit[]>(queryKeys.habits.all)).toEqual([serverHabit]);
        expect(
            queryClient.getQueryData<Habit[]>(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, false]),
        ).toEqual([
            expect.objectContaining({ id: "habit-1", title: "Server habit" }),
        ]);
        expect(queryClient.getQueryData(queryKeys.habits.monthly("habit-1", 2026, 2))).toEqual({
            scheduledDays: [9],
            logsByDay: { 9: "COMPLETED" },
        });
    });

    it("removes habits from the wrong weekly archive view during reconciliation", () => {
        const queryClient = new QueryClient();
        const activeHabit = createHabit({ id: "habit-1", archived: false });

        queryClient.setQueryData(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, false], [activeHabit]);
        queryClient.setQueryData(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, true], [activeHabit]);

        reconcileHabitInCaches(queryClient, { ...activeHabit, archived: true });

        expect(
            queryClient.getQueryData<Habit[]>(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, false]),
        ).toEqual([]);
        expect(
            queryClient.getQueryData<Habit[]>(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, true]),
        ).toEqual([expect.objectContaining({ archived: true })]);
    });
});
