import { useEffect, useMemo, useState } from "react";
import { useSortSensors } from "../../hooks/ui/use-sort-sensors";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    type DragStartEvent,
    type DragEndEvent,
    type UniqueIdentifier,
    type DragOverEvent,
    type DragCancelEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableTaskCard } from "./SortableTaskCard";
import { TaskCard } from "./TaskCard";
import { useReorderTask } from "../../hooks/tasks/use-reorder-task";
import { useTags } from "../../hooks/tags/use-tags";
import { useSubtasksByTaskIds } from "../../hooks/tasks/use-subtasks";
import { computeMidpointIndex } from "../../lib/utils/order-index";
import { TaskContextMenuWrapper } from "./TaskContextMenuWrapper";
import type { Tag } from "@cadence/contracts/tag";
import type { Task } from "@cadence/contracts/task";

interface TaskListProps {
    tasks: Task[];
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
    cardVariant?: "list" | "board";
    className?: string;
    rationaleByTaskId?: Record<string, string | null | undefined>;
    /** False where a manual order means nothing (Today, Upcoming, tag pages): no drag, no grip. */
    reorderable?: boolean;
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

/** The list after dropping `activeId` on `overId`, the moved task and its new fractional order index; null when either is gone. */
function reorderedBy(tasks: Task[], activeId: UniqueIdentifier, overId: UniqueIdentifier) {
    const oldIndex = tasks.findIndex((t) => t.id === activeId);
    const newIndex = tasks.findIndex((t) => t.id === overId);
    if (oldIndex === -1 || newIndex === -1) return null;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const moved = reordered[newIndex];
    // Compute fractional order index
    const prev = reordered[newIndex - 1]?.orderIndex;
    const next = reordered[newIndex + 1]?.orderIndex;
    return { reordered, moved, orderIndex: computeMidpointIndex(prev, next, moved.orderIndex) };
}

/** The card under the finger while it moves. */
function DragPreview(props: Omit<React.ComponentProps<typeof TaskCard>, "isDragging">) {
    return (
        <div className="w-[min(100%,44rem)] cursor-grabbing">
            <TaskCard task={props.task} tags={props.tags} subtasks={props.subtasks} isSelected={props.isSelected} onSelect={props.onSelect} isDragging variant={props.variant} rationaleLabel={props.rationaleLabel} />
        </div>
    );
}

/** DnD-enabled sortable task list */
export function TaskList({
    tasks: initialTasks,
    selectedTaskId,
    onSelectTask,
    cardVariant = "list",
    className = "",
    rationaleByTaskId,
    reorderable = true,
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

    const sensors = useSortSensors();

    /** A card's tags, subtasks and why it is here. */
    const cardData = (task: Task) => ({
        tags: tagsByTaskId[task.id] ?? [],
        subtasks: subtasksByTaskId[task.id] ?? [],
        rationaleLabel: rationaleByTaskId?.[task.id] ?? null,
    });

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
        const move = reorderedBy(tasks, active.id, over.id);
        if (!move) return;

        // Optimistically reorder in local state
        setTasks(move.reordered);
        reorderTask.mutate({
            id: move.moved.id,
            orderIndex: move.orderIndex,
            orderedTaskIds: move.reordered.map((task) => task.id),
        });
    };

    return (
        <DndContext
            sensors={reorderable ? sensors : []}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className={`flex flex-col ${cardVariant === "board" ? "gap-2.5" : "gap-2"} ${className}`}>
                    {tasks.map((task) => (
                        <TaskContextMenuWrapper key={task.id} task={task} onRename={() => {
                            onSelectTask?.(task.id);
                            setTimeout(() => window.dispatchEvent(new CustomEvent('cadence:focus-task-title', { detail: { taskId: task.id } })), 150);
                        }}>
                            <SortableTaskCard
                                task={task}
                                {...cardData(task)}
                                isSelected={selectedTaskId === task.id}
                                isDropTarget={overTaskId === task.id && activeTaskId !== task.id}
                                onSelect={onSelectTask}
                                variant={cardVariant}
                                reorderable={reorderable}
                            />
                        </TaskContextMenuWrapper>
                    ))}
                </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 90, easing: "cubic-bezier(0.22, 0.86, 0.32, 1)" }}>
                {activeTask ? (
                    <DragPreview
                        task={activeTask}
                        {...cardData(activeTask)}
                        isSelected={selectedTaskId === activeTask.id}
                        onSelect={onSelectTask}
                        variant={cardVariant}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
