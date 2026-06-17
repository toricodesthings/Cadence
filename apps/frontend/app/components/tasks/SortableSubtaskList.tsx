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
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import type { Subtask } from "@cadence/contracts/subtask";

type RenderableSubtask = Subtask & { __optimisticKey?: string };

function getRenderableSubtaskKey(subtask: RenderableSubtask) {
    return subtask.__optimisticKey ?? subtask.id;
}

export function computeSubtaskMidpointIndex(prevIndex: number | null, nextIndex: number | null): number {
    if (prevIndex === null && nextIndex === null) return 0;
    if (prevIndex === null) return nextIndex! - 1;
    if (nextIndex === null) return prevIndex! + 1;
    return (prevIndex + nextIndex) / 2;
}

export function buildOptimisticSubtaskReorder(
    subtasks: Subtask[],
    activeId: string,
    overId: string,
): { optimisticSubtasks: Subtask[]; newOrderIndex: number } | null {
    const oldIndex = subtasks.findIndex((subtask) => subtask.id === activeId);
    const newIndex = subtasks.findIndex((subtask) => subtask.id === overId);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return null;
    }

    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    const prevIndex = newIndex > 0 ? reordered[newIndex - 1].orderIndex : null;
    const nextIndex = newIndex < reordered.length - 1 ? reordered[newIndex + 1].orderIndex : null;
    const newOrderIndex = computeSubtaskMidpointIndex(prevIndex, nextIndex);

    return {
        optimisticSubtasks: reordered
            .map((subtask) => (subtask.id === activeId ? { ...subtask, orderIndex: newOrderIndex } : subtask))
            .sort((a, b) => a.orderIndex - b.orderIndex),
        newOrderIndex,
    };
}

export interface SortableSubtaskRenderProps {
    subtask: Subtask;
    isDragging: boolean;
    dragHandleProps: {
        ref: (node: HTMLElement | null) => void;
        listeners: ReturnType<typeof useSortable>["listeners"];
        attributes: ReturnType<typeof useSortable>["attributes"];
    };
}

function SortableSubtaskItem({
    subtask,
    renderItem,
}: {
    subtask: RenderableSubtask;
    renderItem: (props: SortableSubtaskRenderProps) => ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: subtask.id });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
        >
            {renderItem({
                subtask,
                isDragging,
                dragHandleProps: {
                    ref: setActivatorNodeRef,
                    listeners,
                    attributes,
                },
            })}
        </div>
    );
}

export function SortableSubtaskList({
    subtasks,
    onReorder,
    renderItem,
}: {
    subtasks: RenderableSubtask[];
    onReorder: (payload: { id: string; newOrderIndex: number; optimisticSubtasks: Subtask[] }) => void;
    renderItem: (props: SortableSubtaskRenderProps) => ReactNode;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const reorder = buildOptimisticSubtaskReorder(subtasks, String(active.id), String(over.id));
        if (!reorder) return;

        onReorder({
            id: String(active.id),
            newOrderIndex: reorder.newOrderIndex,
            optimisticSubtasks: reorder.optimisticSubtasks,
        });
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={subtasks.map((subtask) => subtask.id)} strategy={verticalListSortingStrategy}>
                {subtasks.map((subtask) => (
                    <SortableSubtaskItem
                        key={getRenderableSubtaskKey(subtask)}
                        subtask={subtask}
                        renderItem={renderItem}
                    />
                ))}
            </SortableContext>
        </DndContext>
    );
}
