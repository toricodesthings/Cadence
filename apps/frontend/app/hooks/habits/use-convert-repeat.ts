import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Habit } from "@cadence/contracts/habit";
import type { Task } from "@cadence/contracts/task";
import { useApiClient } from "../auth/use-api-client";
import { useCreateTask } from "../tasks/use-create-task";
import { useCreateHabit } from "./use-create-habit";
import { invalidateTaskCaches } from "../tasks/optimistic-helpers";
import { invalidateHabitCaches } from "./optimistic-helpers";
import { getTaskMutationTargetId, isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import { toISODate } from "../../lib/utils/date-format";

/** Fixed happens to you, a Routine lets go when missed, a Task carries over. */
export type RepeatKind = "fixed" | "routine" | "task";

export function getTaskRepeatKind(task: Pick<Task, "interactionMode">): RepeatKind {
    return isPassiveTimetableTask(task) ? "fixed" : "task";
}

const DEFAULT_BLOCK_MINUTES = 60;

function localTime(iso: string) {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Moves a repeating item between kinds that live in different tables (task ⇄
 * routine). The new item is created first and the old one is only trashed or
 * archived afterwards, so a failure never loses anything; one toast offers Undo.
 */
export function useConvertRepeat() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const createTask = useCreateTask();
    const createHabit = useCreateHabit();

    const setTaskState = async (id: string, state: "ACTIVE" | "ARCHIVED") => {
        await client.api.tasks[":id"].$patch({ param: { id }, json: { state } });
    };
    const setHabitArchived = async (id: string, archived: boolean) => {
        await client.api.habits[":id"].$patch({ param: { id }, json: { archived } });
    };
    const settle = () => {
        invalidateTaskCaches(queryClient);
        invalidateHabitCaches(queryClient);
    };

    const taskToRoutine = async (task: Task) => {
        if (!task.recurrenceRule) return;
        const taskId = getTaskMutationTargetId(task);
        const habit = await createHabit.mutateAsync({
            title: task.title,
            recurrenceRule: task.recurrenceRule,
            targetTime: !task.isAllDay && task.scheduledStart ? localTime(task.scheduledStart) : null,
            notes: task.content ?? null,
            projectId: task.projectId,
            tagIds: task.tagIds ?? [],
        });
        await setTaskState(taskId, "ARCHIVED");
        settle();
        toast.success("Now a routine", {
            description: "Missed days let go instead of carrying over.",
            action: {
                label: "Undo",
                onClick: async () => {
                    await setTaskState(taskId, "ACTIVE");
                    if (habit?.id) await client.api.habits[":id"].$delete({ param: { id: habit.id } });
                    settle();
                },
            },
        });
    };

    const routineToTask = async (habit: Habit, kind: "fixed" | "task") => {
        const today = toISODate(new Date());
        const timing = habit.targetTime
            ? (() => {
                const start = new Date(`${today}T${habit.targetTime}:00`);
                const end = new Date(start.getTime() + DEFAULT_BLOCK_MINUTES * 60_000);
                return { isAllDay: false, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() };
            })()
            : { isAllDay: true, dueDate: today };
        const task = await createTask.mutateAsync({
            title: habit.title,
            orderIndex: Date.now(),
            recurrenceRule: habit.recurrenceRule,
            interactionMode: kind === "fixed" ? "timetable" : "task",
            content: habit.notes ?? null,
            projectId: habit.projectId,
            tagIds: habit.tagIds ?? [],
            ...timing,
        });
        await setHabitArchived(habit.id, true);
        settle();
        toast.success(kind === "fixed" ? "Now fixed" : "Now a task", {
            description: kind === "fixed" ? "It holds its time, no check-off." : "Missed days carry over until done.",
            action: {
                label: "Undo",
                onClick: async () => {
                    await setHabitArchived(habit.id, false);
                    if (task?.id) await setTaskState(task.id, "ARCHIVED");
                    settle();
                },
            },
        });
    };

    return {
        taskToRoutine,
        routineToTask,
        isPending: createTask.isPending || createHabit.isPending,
    };
}
