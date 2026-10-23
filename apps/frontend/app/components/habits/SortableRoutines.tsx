import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useSortSensors } from "../../hooks/ui/use-sort-sensors";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { computeGappedOrderIndex, computeMidpointIndex } from "@cadence/domain/ordering";
import type { RoutineSort } from "../../lib/utils/habits";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";

/** The slide neighbours make while a routine is dragged past them. */
const SLIDE = { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

/**
 * Drag to reorder routines (by their grip). A drop switches the page to Custom and saves the new
 * order: one midpoint write when the neighbours leave room, otherwise the visible list laid out again.
 * The dropped order is held on screen until those writes settle, so nothing jumps back meanwhile.
 */
export function SortableRoutines({ habits, sort, onSortChange, layout, children }: {
    habits: Habit[];
    sort: RoutineSort;
    onSortChange: (sort: RoutineSort) => void;
    /** "list": rows or stacked cards; "grid": month cards that wrap. */
    layout: "list" | "grid";
    children: (ordered: Habit[]) => ReactNode;
}) {
    const updateHabit = useUpdateHabit();
    const [held, setHeld] = useState<string[] | null>(null);
    const sensors = useSortSensors();

    const ordered = useMemo(() => {
        if (!held) return habits;
        const rank = new Map(held.map((id, index) => [id, index]));
        return [...habits].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    }, [habits, held]);

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const from = ordered.findIndex((habit) => habit.id === active.id);
        const to = ordered.findIndex((habit) => habit.id === over.id);
        if (from < 0 || to < 0) return;
        const next = arrayMove(ordered, from, to);
        setHeld(next.map((habit) => habit.id));
        if (sort !== "custom") onSortChange("custom");

        // A preset's order isn't the stored one, and tied neighbours leave no midpoint: lay it all out again.
        const [prev, after] = [next[to - 1]?.sortOrder, next[to + 1]?.sortOrder];
        const mid = computeMidpointIndex(prev, after, 0);
        const fits = sort === "custom" && (prev === undefined || mid > prev) && (after === undefined || mid < after);
        const writes = fits
            ? [{ id: String(active.id), sortOrder: mid }]
            : next.map((habit, index) => ({ id: habit.id, sortOrder: computeGappedOrderIndex(index + 1) }))
                .filter((write, index) => next[index].sortOrder !== write.sortOrder);
        // A failed write rolls back and says so itself (useUpdateHabit).
        void Promise.allSettled(writes.map((write) => updateHabit.mutateAsync(write))).finally(() => setHeld(null));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ordered.map((habit) => habit.id)} strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
                {children(ordered)}
            </SortableContext>
        </DndContext>
    );
}

/** One routine's place in `SortableRoutines`: spread `style` and `ref` on its row or card, and put `grip` beside its name. */
export function useSortableRoutine(habit: Habit) {
    const reducedMotion = useReducedMotionSetting();
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: habit.id,
        transition: reducedMotion ? null : SLIDE,
    });
    const style: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
    };
    const grip = (
        <span
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            data-dnd-handle="true"
            aria-label={`Drag to reorder ${habit.title}`}
            className="-ml-1 flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-twilight-text-muted/90 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--routine-tone)]/60 active:cursor-grabbing group-hover:opacity-100 lg:h-8 lg:w-5"
        >
            <GripVertical size={16} aria-hidden="true" />
        </span>
    );
    return { ref: setNodeRef, style, grip, isDragging };
}

/** The lift a dragged row or card gets. */
export const DRAGGING = "shadow-[0_12px_40px_rgba(0,0,0,0.3)]";
