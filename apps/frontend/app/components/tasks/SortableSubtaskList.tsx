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

/** Anything ordered by `orderIndex`: subtasks, or a routine's steps (their array position). */
type Sortable = { id: string; orderIndex: number; __optimisticKey?: string };

function getRenderableSubtaskKey(subtask: Sortable) {
    return subtask.__optimisticKey ?? subtask.id;
}

function computeSubtaskMidpointIndex(prevIndex: number | null, nextIndex: number | null): number {
    if (prevIndex === null && nextIndex === null) return 0;
    if (prevIndex === null) return nextIndex! - 1;
    if (nextIndex === null) return prevIndex! + 1;
    return (prevIndex + nextIndex) / 2;
}

function buildOptimisticSubtaskReorder<T extends Sortable>(
    subtasks: T[],
    activeId: string,
    overId: string,
): { optimisticSubtasks: T[]; newOrderIndex: number } | null {
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

export interface SortableSubtaskRenderProps<T extends Sortable = Sortable> {
    subtask: T;
    isDragging: boolean;
    dragHandleProps: {
        ref: (node: HTMLElement | null) => void;
        listeners: ReturnType<typeof useSortable>["listeners"];
        attributes: ReturnType<typeof useSortable>["attributes"];
    };
}

function SortableSubtaskItem<T extends Sortable>({
    subtask,
    renderItem,
}: {
    subtask: T;
    renderItem: (props: SortableSubtaskRenderProps<T>) => ReactNode;
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

export function SortableSubtaskList<T extends Sortable>({
    subtasks,
    onReorder,
    renderItem,
}: {
    subtasks: T[];
    onReorder: (payload: { id: string; newOrderIndex: number; optimisticSubtasks: T[] }) => void;
    renderItem: (props: SortableSubtaskRenderProps<T>) => ReactNode;
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
