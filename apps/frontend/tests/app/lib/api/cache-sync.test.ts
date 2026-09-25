import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
    reconcileHabitInCaches,
    reconcileTaskInCaches,
    removeTaskFromCaches,
} from "../../../../app/lib/api/cache-sync";
import { queryKeys } from "../../../../app/lib/api/query-keys";
import type { Habit } from "@cadence/contracts/habit";
import type { Task } from "@cadence/contracts/task";
import { makeHabit, makeTask } from "../../../helpers";

describe("reconcileTaskInCaches with a bare write response", () => {
    it("keeps the cached tagIds the response leaves out", () => {
        const queryClient = new QueryClient();
        const key = queryKeys.tasks.list({ state: "ACTIVE" });
        queryClient.setQueryData(key, [makeTask({ tagIds: ["tag-1"] })]);

        const { tagIds: _omitted, ...bareRow } = makeTask({ title: "Renamed" });
        reconcileTaskInCaches(queryClient, bareRow as Task);

        expect(queryClient.getQueryData<Task[]>(key)).toEqual([expect.objectContaining({ title: "Renamed", tagIds: ["tag-1"] })]);
    });
});

describe("api/cache-sync", () => {
    it("reconciles task caches across matching and non-matching lists", () => {
        const queryClient = new QueryClient();
        const activeTask = makeTask();
        const waitingTask = makeTask({ id: "task-2", state: "WAITING" });
        const holdingTask = makeTask({ id: "task-3", projectId: null, dueDate: "2026-03-09" });

        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE" }), [activeTask]);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "WAITING" }), [waitingTask]);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE", hasNoProject: true }), [holdingTask]);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE", effectiveOnOrBeforeDate: "2026-03-09" }), [holdingTask]);
        queryClient.setQueryData(queryKeys.tasks.detail(activeTask.id), activeTask);

        const updated = makeTask({ id: activeTask.id, state: "WAITING", title: "Moved task" });
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
        const task = makeTask();

        queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
        queryClient.setQueryData(queryKeys.tasks.list({ state: "ACTIVE" }), [task]);

        removeTaskFromCaches(queryClient, task.id);

        expect(queryClient.getQueryData(queryKeys.tasks.detail(task.id))).toBeUndefined();
        expect(queryClient.getQueryData(queryKeys.tasks.list({ state: "ACTIVE" }))).toEqual([]);
    });

    it("invalidates task list caches instead of reconciling recurring series inline", async () => {
        const queryClient = new QueryClient();
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
        const recurring = makeTask({
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            isAllDay: false,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
        });

        reconcileTaskInCaches(queryClient, recurring);

        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tasks.all });
    });

    it("replaces optimistic habits", () => {
        const queryClient = new QueryClient();
        const optimistic = makeHabit({ id: "temp-1", title: "Optimistic habit" });
        const weekly = makeHabit({ id: "temp-1", logs: [{ id: "virt", habitId: "temp-1", targetDate: "2026-03-09T00:00:00.000Z", status: "PENDING", completedAt: null }] });

        queryClient.setQueryData(queryKeys.habits.all, [optimistic]);
        queryClient.setQueryData(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, false], [weekly]);

        const serverHabit = makeHabit({ id: "habit-1", title: "Server habit" });
        reconcileHabitInCaches(queryClient, serverHabit, "temp-1");

        expect(queryClient.getQueryData<Habit[]>(queryKeys.habits.all)).toEqual([serverHabit]);
        expect(
            queryClient.getQueryData<Habit[]>(["habits", "weekly", { start: "2026-03-08", end: "2026-03-14" }, false]),
        ).toEqual([
            expect.objectContaining({ id: "habit-1", title: "Server habit" }),
        ]);
    });

    it("removes habits from the wrong weekly archive view during reconciliation", () => {
        const queryClient = new QueryClient();
        const activeHabit = makeHabit({ id: "habit-1", archived: false });

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
