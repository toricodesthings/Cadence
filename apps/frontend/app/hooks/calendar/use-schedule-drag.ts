import { useCallback, useMemo, useState } from "react";
import { useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import type { Task } from "@cadence/contracts/task";
import { toast } from "sonner";
import { MouseSensor, TouchSensor } from "../../lib/utils/dnd";
import { canDragScheduleTask, resolveScheduleDrop } from "../../lib/utils/calendar/schedule-drop";
import { temporalOf } from "../../lib/utils/calendar/schedule-model";
import { trackUsageEvent } from "../../lib/api/track-event";
import { useUpdateTask } from "../tasks/use-update-task";
import { useDurationGuesser } from "../ai/use-duration-guess";

export function useScheduleDrag(tasks: ReadonlyMap<string, Task>) {
    const { mutate: updateTask } = useUpdateTask();
    const guessOf = useDurationGuesser();
    const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
    const [activeDropId, setActiveDropId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }),
    );
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const taskId = event.active.data.current?.taskId;
        if (typeof taskId === "string") setActiveDragTask(tasks.get(taskId) ?? null);
    }, [tasks]);
    // A view switch can replace the active query during a drag; retain its source task.
    const findDraggedTask = useCallback((id: string) => tasks.get(id) ??
        (activeDragTask?.id === id ? activeDragTask : undefined), [tasks, activeDragTask]);
    const handleDragOver = useCallback((event: DragOverEvent) => {
        const taskId = event.active.data.current?.taskId;
        const task = typeof taskId === "string" ? findDraggedTask(taskId) : undefined;
        setActiveDropId(task && canDragScheduleTask(task) && event.over ? String(event.over.id) : null);
    }, [findDraggedTask]);
    const handleDragCancel = useCallback(() => {
        setActiveDragTask(null);
        setActiveDropId(null);
    }, []);
    const activeDropPreview = useMemo(() => activeDragTask && activeDropId
        ? resolveScheduleDrop(activeDragTask, activeDropId, guessOf(activeDragTask))?.preview ?? null : null, [activeDragTask, activeDropId, guessOf]);
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        handleDragCancel();
        const taskId = event.active.data.current?.taskId;
        if (typeof taskId !== "string" || !event.over) return;
        const task = findDraggedTask(taskId);
        if (!task) return;
        const drop = resolveScheduleDrop(task, String(event.over.id), guessOf(task));
        if (!drop) return;
        const previous = temporalOf(task);
        updateTask({ id: taskId, ...drop.patch });
        trackUsageEvent("schedule.drop_completed", { input_method: "dnd", object_type: "task", outcome: drop.outcome });
        toast.message("Task moved", { action: { label: "Undo", onClick: () => updateTask({ id: taskId, ...previous }) } });
    }, [handleDragCancel, findDraggedTask, updateTask, guessOf]);
    return { sensors, activeDragTask, activeDropPreview, handleDragStart, handleDragOver, handleDragCancel, handleDragEnd };
}
export type ScheduleDrag = ReturnType<typeof useScheduleDrag>;
