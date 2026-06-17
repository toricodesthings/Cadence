import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import type { Project } from "@cadence/contracts/project";
import type { Tag } from "@cadence/contracts/tag";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { HabitMonthlyData } from "../../hooks/habits/use-habit-monthly";
import { transformListCache } from "./cache-guards";
import { getTaskEffectiveAnchor, isRecurringTask, isRecurringTaskInstance } from "../utils/task/task-scheduling";

function matchesTaskList(task: Task, filters: Record<string, unknown>) {
    if (filters.state && task.state !== filters.state) return false;
    if (filters.projectId && task.projectId !== filters.projectId) return false;
    if (filters.hasNoProject === true && task.projectId !== null) return false;
    if (filters.hasNoDate === true && (task.dueDate || task.scheduledStart || task.scheduledEnd)) return false;
    if (filters.scheduledDate) {
        const date = String(filters.scheduledDate);
        const anchor = getTaskEffectiveAnchor(task);
        if (anchor !== date) return false;
    }
    if (filters.scheduledRange && typeof filters.scheduledRange === "object") {
        const range = filters.scheduledRange as { start?: string; end?: string };
        const compareValue = getTaskEffectiveAnchor(task);
        if (!compareValue) return false;
        if (range.start && compareValue < range.start) return false;
        if (range.end && compareValue > range.end) return false;
    }
    if (filters.effectiveOnOrBeforeDate) {
        const anchor = getTaskEffectiveAnchor(task);
        if (!anchor || anchor > String(filters.effectiveOnOrBeforeDate)) return false;
    }
    return true;
}

export function reconcileTaskInCaches(queryClient: QueryClient, task: Task, replaceId?: string) {
    if (isRecurringTask(task) || isRecurringTaskInstance(task)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        return;
    }

    queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
    const taskLists = queryClient
        .getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all })
        .filter(([key]) => typeof key[1] === "object");
    taskLists.forEach(([key, old]) => {
        const filters = (key[1] as Record<string, unknown> | undefined) ?? {};
        const withoutOld = Array.isArray(old)
            ? old.filter((entry) => entry.id !== task.id && entry.id !== replaceId)
            : [];
        const next = matchesTaskList(task, filters)
            ? [...withoutOld, task].sort((a, b) => {
                if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
                return a.orderIndex - b.orderIndex;
            })
            : withoutOld;
        queryClient.setQueryData(key, next);
    });
}

export function removeTaskFromCaches(queryClient: QueryClient, taskId: string) {
    queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(taskId), exact: true });
    queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.all }, (old) =>
        transformListCache(old, (items) => items.filter((task) => task.id !== taskId)),
    );
}

export function reconcileHabitInCaches(queryClient: QueryClient, habit: Habit, replaceId?: string) {
    queryClient.setQueryData(queryKeys.habits.detail(habit.id), habit);

    // Helper: update habit in-place to preserve array order
    const updateInPlace = (items: Habit[]): Habit[] => {
        const idx = items.findIndex((entry) => entry.id === habit.id || entry.id === replaceId);
        if (idx >= 0) {
            const updated = [...items];
            updated[idx] = { ...items[idx], ...habit };
            return updated;
        }
        return [...items, habit];
    };

    const habitLists = queryClient
        .getQueriesData<Habit[]>({ queryKey: queryKeys.habits.all })
        .filter(([key]) => key.length === 1);
    habitLists.forEach(([key, old]) => {
        if (!Array.isArray(old)) return;
        queryClient.setQueryData(key, updateInPlace(old));
    });

    const weeklyLists = queryClient
        .getQueriesData<Habit[]>({ queryKey: queryKeys.habits.weeklyAll })
        .filter(([key]) => key[1] === "weekly");
    weeklyLists.forEach(([key, old]) => {
        if (!Array.isArray(old)) return;
        const archivedFlag = key.at(-1);
        const matchesArchivedView = typeof archivedFlag === "boolean" ? archivedFlag === habit.archived : true;

        if (matchesArchivedView) {
            queryClient.setQueryData(key, updateInPlace(old));
            return;
        }

        queryClient.setQueryData(key, old.filter((entry) => entry.id !== habit.id && entry.id !== replaceId));
    });
}

export function removeHabitFromCaches(queryClient: QueryClient, habitId: string) {
    queryClient.removeQueries({ queryKey: queryKeys.habits.detail(habitId), exact: true });
    queryClient.setQueriesData<Habit[]>({ queryKey: queryKeys.habits.all }, (old) =>
        transformListCache(old, (items) => items.filter((habit) => habit.id !== habitId)),
    );
    queryClient.setQueriesData<Habit[]>({ queryKey: queryKeys.habits.weeklyAll }, (old) =>
        transformListCache(old, (items) => items.filter((habit) => habit.id !== habitId)),
    );
    queryClient.removeQueries({ queryKey: ["habits", habitId, "monthly"] });
}

export function patchHabitMonthlyCache(
    queryClient: QueryClient,
    habitId: string,
    targetDate: string,
    status: string,
) {
    const date = new Date(targetDate);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    queryClient.setQueryData<HabitMonthlyData>(
        queryKeys.habits.monthly(habitId, year, month),
        (old) => {
            if (!old) return old;
            return {
                ...old,
                logsByDay: {
                    ...old.logsByDay,
                    [day]: status,
                },
            };
        },
    );
}

export function reconcileProjectInCaches(queryClient: QueryClient, project: Project, replaceId?: string) {
    queryClient.setQueryData(queryKeys.projects.detail(project.id), project);
    queryClient.setQueriesData<Project[]>(
        { queryKey: queryKeys.projects.all },
        (old) =>
            transformListCache(
                old,
                (items) => [...items.filter((entry) => entry.id !== project.id && entry.id !== replaceId), project],
                { initialize: true },
            ),
    );
}

export function removeProjectFromCaches(queryClient: QueryClient, projectId: string) {
    queryClient.removeQueries({ queryKey: queryKeys.projects.detail(projectId), exact: true });
    queryClient.setQueriesData<Project[]>({ queryKey: queryKeys.projects.all }, (old) =>
        transformListCache(old, (items) => items.filter((project) => project.id !== projectId)),
    );
}

export function reconcileTagInCaches(queryClient: QueryClient, tag: Tag, replaceId?: string) {
    queryClient.setQueriesData<Tag[]>(
        { queryKey: queryKeys.tags.all },
        (old) =>
            transformListCache(
                old,
                (items) => [...items.filter((entry) => entry.id !== tag.id && entry.id !== replaceId), tag],
                { initialize: true },
            ),
    );
}

export function removeTagFromCaches(queryClient: QueryClient, tagId: string) {
    queryClient.setQueriesData<Tag[]>({ queryKey: queryKeys.tags.all }, (old) =>
        transformListCache(old, (items) => items.filter((tag) => tag.id !== tagId)),
    );
}

export function reconcileInboxItemInCaches(queryClient: QueryClient, item: InboxItem, replaceId?: string) {
    queryClient.setQueriesData<InboxItem[]>(
        { queryKey: queryKeys.inbox.all },
        (old) =>
            transformListCache(
                old,
                (items) => [item, ...items.filter((entry) => entry.id !== item.id && entry.id !== replaceId)],
                { initialize: true },
            ),
    );
}

export function removeInboxItemFromCaches(queryClient: QueryClient, itemId: string) {
    queryClient.setQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all }, (old) =>
        transformListCache(old, (items) => items.filter((item) => item.id !== itemId)),
    );
}
