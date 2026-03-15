import { useEffect, useMemo, useState } from "react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
    type DragCancelEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableTaskCard } from "./SortableTaskCard";
import { TaskCard } from "./TaskCard";
import { useReorderTask } from "../../hooks/tasks";
import { useTags } from "../../hooks/tags";
import { useSubtasksByTaskIds } from "../../hooks/tasks/use-subtasks";
import { computeMidpointIndex } from "../../lib/utils/order-index";
import { TaskContextMenuWrapper } from "./TaskContextMenuWrapper";
import type { Tag } from "../../types/tag";
import type { Task } from "../../types/task";
import { MouseSensor, TouchSensor } from "../../lib/utils/dnd";

interface TaskListProps {
    tasks: Task[];
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
    cardVariant?: "list" | "board";
}

function mergeTasksPreservingLocalOrder(current: Task[], incoming: Task[]) {
    if (current.length === 0) return incoming;

    const incomingById = new Map(incoming.map((task) => [task.id, task] as const));
    const merged: Task[] = [];

    for (const task of current) {
        const nextTask = incomingById.get(task.id);
        if (!nextTask) continue;
        merged.push(nextTask);
        incomingById.delete(task.id);
    }

    for (const task of incoming) {
        if (incomingById.has(task.id)) {
            merged.push(task);
        }
    }

    return merged;
}

/** DnD-enabled sortable task list */
export function TaskList({
    tasks: initialTasks,
    selectedTaskId,
    onSelectTask,
    cardVariant = "list",
}: TaskListProps) {
    const [tasks, setTasks] = useState(initialTasks);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [overTaskId, setOverTaskId] = useState<string | null>(null);
    const reorderTask = useReorderTask();
    const { data: allTags = [] } = useTags();
    const taskIds = useMemo(() => initialTasks.map((task) => task.id), [initialTasks]);
    const { data: subtasksByTaskId = {} } = useSubtasksByTaskIds(taskIds);

    const tagsByTaskId = useMemo(() => {
        const tagsById = new Map(allTags.map((tag) => [tag.id, tag] as const));
        return initialTasks.reduce<Record<string, Tag[]>>((acc, task) => {
            acc[task.id] = (task.tagIds ?? [])
                .map((tagId) => tagsById.get(tagId))
                .filter((tag): tag is Tag => Boolean(tag));
            return acc;
        }, {});
    }, [allTags, initialTasks]);

    useEffect(() => {
        setTasks((current) => {
            if (activeTaskId || reorderTask.isPending) {
                return mergeTasksPreservingLocalOrder(current, initialTasks);
            }

            return initialTasks;
        });
    }, [activeTaskId, initialTasks, reorderTask.isPending]);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? null : null;

    const handleDragStart = (event: DragStartEvent) => {
        setActiveTaskId(String(event.active.id));
    };

    const handleDragOver = (event: DragOverEvent) => {
        setOverTaskId(event.over ? String(event.over.id) : null);
    };

    const handleDragCancel = (_event: DragCancelEvent) => {
        setActiveTaskId(null);
        setOverTaskId(null);
        setTasks(initialTasks);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveTaskId(null);
        setOverTaskId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = tasks.findIndex((t) => t.id === active.id);
        const newIndex = tasks.findIndex((t) => t.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        // Optimistically reorder in local state
        const reordered = arrayMove(tasks, oldIndex, newIndex);
        const moved = reordered[newIndex];
        setTasks(reordered);

        // Compute fractional order index
        const prev = reordered[newIndex - 1]?.orderIndex;
        const next = reordered[newIndex + 1]?.orderIndex;
        const newOrderIndex = computeMidpointIndex(prev, next, moved.orderIndex);

        reorderTask.mutate({
            id: moved.id,
            orderIndex: newOrderIndex,
            orderedTaskIds: reordered.map((task) => task.id),
        });
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col mt-4 gap-1">
                    {tasks.map((task) => (
                        <TaskContextMenuWrapper key={task.id} task={task}>
                            <SortableTaskCard
                                task={task}
                                tags={tagsByTaskId[task.id] ?? []}
                                subtasks={subtasksByTaskId[task.id] ?? []}
                                isSelected={selectedTaskId === task.id}
                                isDropTarget={overTaskId === task.id && activeTaskId !== task.id}
                                onSelect={onSelectTask}
                                variant={cardVariant}
                            />
                        </TaskContextMenuWrapper>
                    ))}
                </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 90, easing: "cubic-bezier(0.22, 0.86, 0.32, 1)" }}>
                {activeTask ? (
                    <div className="w-[min(100%,44rem)] cursor-grabbing">
                        <TaskCard
                            task={activeTask}
                            tags={tagsByTaskId[activeTask.id] ?? []}
                            subtasks={subtasksByTaskId[activeTask.id] ?? []}
                            isSelected={selectedTaskId === activeTask.id}
                            onSelect={onSelectTask}
                            isDragging
                            variant={cardVariant}
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
