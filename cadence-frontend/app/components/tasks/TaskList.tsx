import { useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableTaskCard } from "./SortableTaskCard";
import { useReorderTask } from "../../hooks/tasks";
import { computeMidpointIndex } from "../../lib/utils/order-index";
import { TaskContextMenuWrapper } from "./TaskContextMenuWrapper";
import type { Task } from "../../types/task";

interface TaskListProps {
    tasks: Task[];
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
}

/** DnD-enabled sortable task list */
export function TaskList({ tasks: initialTasks, selectedTaskId, onSelectTask }: TaskListProps) {
    const [tasks, setTasks] = useState(initialTasks);
    const reorderTask = useReorderTask();

    // Sync when parent tasks change (e.g. after query invalidation)
    if (JSON.stringify(tasks.map((t) => t.id)) !== JSON.stringify(initialTasks.map((t) => t.id))) {
        setTasks(initialTasks);
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = tasks.findIndex((t) => t.id === active.id);
        const newIndex = tasks.findIndex((t) => t.id === over.id);

        // Optimistically reorder in local state
        const reordered = [...tasks];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);
        setTasks(reordered);

        // Compute fractional order index
        const prev = reordered[newIndex - 1]?.orderIndex;
        const next = reordered[newIndex + 1]?.orderIndex;
        const newOrderIndex = computeMidpointIndex(prev, next, moved.orderIndex);

        reorderTask.mutate({ id: moved.id, orderIndex: newOrderIndex });
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col mt-4">
                    {tasks.map((task) => (
                        <TaskContextMenuWrapper key={task.id} task={task}>
                            <SortableTaskCard
                                task={task}
                                isSelected={selectedTaskId === task.id}
                                onSelect={onSelectTask}
                            />
                        </TaskContextMenuWrapper>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
