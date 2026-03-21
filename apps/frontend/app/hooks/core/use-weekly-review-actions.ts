import { useState, useMemo, useCallback } from "react";
import { useInbox, useDeleteInboxItem } from "../inbox";
import { useTasks, useUpdateTask, useCreateTask, useArchiveTask } from "../tasks";
import { useHabitsWeekly } from "../habits/use-habits";
import { usePauseHabit } from "../habits/use-pause-habit";
import { toISODate } from "../../lib/utils/date-format";
import type { Task } from "../../types/task";

export interface HabitReviewItem {
    id: string;
    title: string;
    completedThisWeek: number;
    skippedThisWeek: number;
    pendingThisWeek: number;
    totalThisWeek: number;
    hasTargetTime: boolean;
}

function getToday() {
    return toISODate(new Date());
}

function getTomorrow() {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return toISODate(t);
}

export function useWeeklyReviewActions(currentStep: number) {
    const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [keptWaitingIds, setKeptWaitingIds] = useState<Set<string>>(new Set());

    const { data: inboxItems = [] } = useInbox();
    const { data: activeTasks = [] } = useTasks({ state: "ACTIVE" });
    const { data: waitingTasks = [] } = useTasks({ state: "WAITING" });

    const updateTask = useUpdateTask();
    const createTask = useCreateTask();
    const archiveTask = useArchiveTask();
    const deleteInboxItem = useDeleteInboxItem();

    const unscheduledTasks = useMemo(
        () => activeTasks.filter((t) => !t.scheduledStart),
        [activeTasks],
    );

    const visibleWaiting = waitingTasks.filter((t) => !keptWaitingIds.has(t.id));

    // Habit stats
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const { data: habits = [] } = useHabitsWeekly({
        start: toISODate(weekAgo),
        end: toISODate(today),
        enabled: currentStep === 4,
    });

    const habitStats = useMemo(() => {
        let total = 0;
        let completed = 0;
        for (const h of habits) {
            const logs = h.logs ?? [];
            total += logs.length;
            completed += logs.filter((l: any) => l.status === "COMPLETED").length;
        }
        return { total, completed };
    }, [habits]);

    const habitReviewItems = useMemo<HabitReviewItem[]>(() => {
        return habits
            .filter((h) => !h.archived)
            .map((h) => {
                const logs = h.logs ?? [];
                return {
                    id: h.id,
                    title: h.title,
                    completedThisWeek: logs.filter((l: any) => l.status === "COMPLETED").length,
                    skippedThisWeek: logs.filter((l: any) => l.status === "SKIPPED").length,
                    pendingThisWeek: logs.filter((l: any) => l.status === "PENDING").length,
                    totalThisWeek: logs.length,
                    hasTargetTime: !!h.targetTime,
                };
            });
    }, [habits]);

    const pauseHabit = usePauseHabit();

    const runCardAction = useCallback(async (actionKey: string, actionFn: () => Promise<void>) => {
        if (pendingActionKey) return;
        setPendingActionKey(actionKey);
        setActionError(null);
        try {
            await actionFn();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Something went wrong while processing this step.");
        } finally {
            setPendingActionKey(null);
        }
    }, [pendingActionKey]);

    const handleInboxAction = useCallback(async (item: any, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") {
            await deleteInboxItem.mutateAsync(item.id);
        } else if (action === "today") {
            await createTask.mutateAsync({ title: item.rawText, dueDate: getToday(), isAllDay: true, orderIndex: 0 });
            await deleteInboxItem.mutateAsync(item.id);
        } else if (action === "tomorrow") {
            await createTask.mutateAsync({ title: item.rawText, dueDate: getTomorrow(), isAllDay: true, orderIndex: 0 });
            await deleteInboxItem.mutateAsync(item.id);
        } else if (action === "someday") {
            const newTask = await createTask.mutateAsync({ title: item.rawText, orderIndex: 0 });
            if (newTask) {
                await updateTask.mutateAsync({ id: newTask.id, state: "WAITING" });
            }
            await deleteInboxItem.mutateAsync(item.id);
        }
    }, [createTask, deleteInboxItem, updateTask]);

    const handleUnscheduledAction = useCallback(async (task: Task, action: "today" | "tomorrow" | "someday" | "delete") => {
        if (action === "delete") {
            await archiveTask.mutateAsync(task.id);
        } else if (action === "today") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getToday(), scheduledStart: null, scheduledEnd: null, isAllDay: true });
        } else if (action === "tomorrow") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getTomorrow(), scheduledStart: null, scheduledEnd: null, isAllDay: true });
        } else if (action === "someday") {
            await updateTask.mutateAsync({ id: task.id, state: "WAITING" });
        }
    }, [archiveTask, updateTask]);

    const handleWaitingAction = useCallback(async (task: Task, action: "today" | "tomorrow" | "keep" | "delete") => {
        if (action === "delete") {
            await archiveTask.mutateAsync(task.id);
        } else if (action === "today") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getToday(), scheduledStart: null, scheduledEnd: null, isAllDay: true, state: "ACTIVE" });
        } else if (action === "tomorrow") {
            await updateTask.mutateAsync({ id: task.id, dueDate: getTomorrow(), scheduledStart: null, scheduledEnd: null, isAllDay: true, state: "ACTIVE" });
        } else if (action === "keep") {
            setKeptWaitingIds((prev) => new Set(prev).add(task.id));
        }
    }, [archiveTask, updateTask]);

    return {
        inboxItems,
        unscheduledTasks,
        visibleWaiting,
        habitStats,
        habitReviewItems,
        pauseHabit,
        pendingActionKey,
        actionError,
        runCardAction,
        handleInboxAction,
        handleUnscheduledAction,
        handleWaitingAction,
        setKeptWaitingIds,
    };
}
