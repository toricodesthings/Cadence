import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { TaskCard } from "./TaskCard";
import type { Tag } from "@cadence/contracts/tag";
import type { Subtask } from "@cadence/contracts/subtask";
import type { Task } from "@cadence/contracts/task";

interface SortableTaskCardProps {
    task: Task;
    tags?: Tag[];
    subtasks?: Subtask[];
    isSelected?: boolean;
    isDropTarget?: boolean;
    onSelect?: (id: string) => void;
    variant?: "list" | "board";
    rationaleLabel?: string | null;
}

/**
 * Thin dnd-kit sortable wrapper around TaskCard.
 *
 * Drag is scoped to an explicit grip handle inside TaskCard so that
 * the card body stays free for selection, text selection and right-click
 * context menus without competing with DnD pointer events.
 *
 * Completion animation (design manifesto §5):
 *  "Like a candle flame going out. No goofy bouncing or party effects."
 *  - immediate opacity fade to 0.4 over 300ms
 *  - 1.5s later the card collapses its height to 0
 */
export function SortableTaskCard({
    task,
    tags = [],
    subtasks = [],
    isSelected,
    isDropTarget,
    onSelect,
    variant = "list",
    rationaleLabel,
}: SortableTaskCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id });

    const isComplete = task.state === "COMPLETE";
    const prevCompleteRef = useRef(isComplete);

    // Detect if task just became complete (transition from incomplete → complete)
    const justCompleted = isComplete && !prevCompleteRef.current;
    prevCompleteRef.current = isComplete;

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            data-dnd-card
            data-dnd-draggable="true"
            layout
            initial={false}
            animate={{
                opacity: isDragging ? 0.5 : isComplete ? 0.4 : 1,
                scale: isDragging ? 1.02 : 1,
                boxShadow: isDragging
                    ? "0 12px 40px rgba(0,0,0,0.3), 0 0 20px color-mix(in srgb, var(--accent-primary) 6%, transparent)"
                    : "0 0 0 rgba(0,0,0,0)",
            }}
            transition={{
                opacity: { duration: 0.3, ease: "easeOut" },
                scale: { type: "spring", stiffness: 400, damping: 30 },
                boxShadow: { duration: 0.2 },
            }}
        >
            <TaskCard
                task={task}
                tags={tags}
                subtasks={subtasks}
                isDragging={isDragging}
                isSelected={isSelected}
                isDropTarget={isDropTarget}
                onSelect={onSelect}
                variant={variant}
                rationaleLabel={rationaleLabel}
                dragHandleProps={{
                    ref: setActivatorNodeRef,
                    listeners,
                    attributes,
                }}
            />
        </motion.div>
    );
}
