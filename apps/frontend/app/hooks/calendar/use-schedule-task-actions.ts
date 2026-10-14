import { useCallback, useMemo, useState } from "react";
import type { Task } from "@cadence/contracts/task";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { rescheduleToDay } from "@cadence/domain/task-temporal";
import { parseVirtualHabitId } from "../habits/use-virtual-habit-tasks";
import { useUpdateTask } from "../tasks/use-update-task";
import { timeAction, useResolveHabit } from "../habits/use-resolve-habit";
import { useTaskCompletionStore } from "../../stores/task-completion-store";
import { temporalOf } from "../../lib/utils/calendar/schedule-model";
import { taskDays } from "../../lib/utils/calendar/schedule-day";
import { getUserZone } from "../../lib/utils/user-zone";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { toast } from "sonner";

export function useScheduleTaskActions(allVisibleTasks: ReadonlyMap<string, Task>, todayIso: LocalDate, handleSelectTask: (id: string) => void) {
    const { mutate: updateTask } = useUpdateTask();
    const resolveHabitMutation = useResolveHabit();
    const queueCompletion = useTaskCompletionStore((state) => state.queueCompletion);
    const [placeTask, setPlaceTask] = useState<Task | null>(null);
    const [readyOpen, setReadyOpen] = useState(false);
    const [lightenOpen, setLightenOpen] = useState(false);
    /** Move a task to another day, keeping its time of day and length. One Undo. */
    const moveTaskToDay = useCallback((task: Task, day: LocalDate, { quiet = false } = {}) => {
        const prev = temporalOf(task);
        updateTask({ id: task.id, ...rescheduleToDay(prev, day, getUserZone()) });
        if (!quiet) {
            toast.message(`Moved to ${formatShortDateLabel(day)}`, { action: { label: "Undo", onClick: () => updateTask({ id: task.id, ...prev }) } });
        }
        return prev;
    }, [updateTask]);

    /** One routine day (or one of its times) to a status; the check-off, skip and clear of every surface. */
    const resolveRoutine = useCallback((task: Task, status: "COMPLETED" | "SKIPPED" | "PENDING") => {
        const parts = parseVirtualHabitId(task.id);
        if (!parts) return;
        return resolveHabitMutation.mutateAsync({
            habitId: parts.habitId,
            targetDate: parts.day,
            // A block of a routine at set times is one time, not the day.
            ...(parts.time ? timeAction(parts.time, status) : { status }),
        });
    }, [resolveHabitMutation]);

    // ── Row and chip actions ────────────────────────────────────────────────
    const completeTask = useCallback((task: Task) => {
        // Same short, cancellable countdown the checkbox shows.
        queueCompletion({ taskId: task.id, onCommit: () => updateTask({ id: task.id, state: "COMPLETE" }) });
    }, [queueCompletion, updateTask]);

    const completeRow = useCallback((task: Task) => {
        if (task.isHabit) return resolveRoutine(task, task.state === "COMPLETE" ? "PENDING" : "COMPLETED");
        completeTask(task);
    }, [completeTask, resolveRoutine]);

    const moveRowLater = useCallback((task: Task) => {
        const from = taskDays(task)[0] ?? todayIso;
        moveTaskToDay(task, addDays(from < todayIso ? todayIso : from, 1));
    }, [moveTaskToDay, todayIso]);

    const moveToTomorrow = useCallback((task: Task) => moveTaskToDay(task, addDays(todayIso, 1)), [moveTaskToDay, todayIso]);

    const rowHandlers = useMemo(() => ({
        onOpen: (task: Task) => handleSelectTask(task.id),
        onComplete: completeRow,
        onLater: moveRowLater,
        onPickDay: (task: Task) => setPlaceTask(task),
    }), [completeRow, handleSelectTask, moveRowLater]);

    const lightenToday = useCallback((tasks: Task[], to: "tomorrow" | "holding") => {
        const tomorrow = addDays(todayIso, 1);
        const previous = tasks.map((task) => {
            const prev = { id: task.id, ...temporalOf(task) };
            if (to === "tomorrow") moveTaskToDay(task, tomorrow, { quiet: true });
            else updateTask({ id: task.id, dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null });
            return prev;
        });
        toast.message(to === "tomorrow" ? "Moved to tomorrow" : "Dates cleared", {
            action: { label: "Undo", onClick: () => previous.forEach((prev) => updateTask(prev)) },
        });
    }, [moveTaskToDay, todayIso, updateTask]);

    const handleResizeTask = useCallback((taskId: string, durationMinutes: number) => {
        const task = allVisibleTasks.get(taskId);
        if (!task?.scheduledStart) return;
        const newEnd = new Date(new Date(task.scheduledStart).getTime() + durationMinutes * 60_000);
        updateTask({ id: taskId, scheduledEnd: newEnd.toISOString() });
    }, [updateTask, allVisibleTasks]);

    return {
        rowHandlers, moveTaskToDay, completeTask, resolveRoutine, moveToTomorrow, handleResizeTask, lightenToday,
        placeTask, setPlaceTask, readyOpen, setReadyOpen, lightenOpen, setLightenOpen,
    };
}
export type ScheduleTaskActions = ReturnType<typeof useScheduleTaskActions>;
