import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import type { Habit } from "@cadence/contracts/habit";
import type { Task } from "@cadence/contracts/task";

export function testQueryClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** `wrapper` for render/renderHook that provides a QueryClient. */
export function withClient(client = testQueryClient()) {
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Prints the router's path and query so tests can assert navigation. */
export function Location() {
    const location = useLocation();
    return <output aria-label="Current location">{location.pathname}{location.search}</output>;
}

export function makeTask(overrides: Partial<Task> = {}): Task {
    return {
        id: "task-1", userId: "user-1", projectId: null, sectionId: null, title: "Task", content: null,
        state: "ACTIVE", orderIndex: 1, isAllDay: true, dueDate: null, scheduledStart: null, scheduledEnd: null,
        durationEstimate: null, timezoneLocked: false, priority: 0, isPinned: false, reminderAt: null,
        reminderSilenced: false, recurrenceRule: null, interactionMode: "task", effort: null, tagIds: [],
        seriesId: undefined, isRecurringInstance: false, occurrenceStart: null, occurrenceEnd: null,
        createdAt: "2026-03-09T00:00:00.000Z", updatedAt: "2026-03-09T00:00:00.000Z",
        ...overrides,
    };
}

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
    return {
        id: "habit-1", userId: "user-1", title: "Habit", description: null, steps: null, notes: null,
        recurrenceRule: "FREQ=DAILY", targetTime: null, targetTimes: null, reminderEnabled: false,
        totalCompletions: 0, totalSkips: 0, currentStreak: 0, longestStreak: 0, colorAccent: "lantern",
        archived: false, emoji: null, projectId: null, sortOrder: 0, pausedUntil: null, logs: [],
        createdAt: "2026-03-09T00:00:00.000Z", updatedAt: "2026-03-09T00:00:00.000Z",
        ...overrides,
    };
}
