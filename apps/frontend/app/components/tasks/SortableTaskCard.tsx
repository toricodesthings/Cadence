import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { TaskCard } from "./TaskCard";
import type { Tag } from "../../types/tag";
import type { Task, Subtask } from "../../types/task";

interface SortableTaskCardProps {
    task: Task;
    tags?: Tag[];
    subtasks?: Subtask[];
    isSelected?: boolean;
    isDropTarget?: boolean;
    onSelect?: (id: string) => void;
    variant?: "list" | "board";
}

/**
 * Thin dnd-kit sortable wrapper around TaskCard.
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
}: SortableTaskCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
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
            role={attributes.role}
            tabIndex={attributes.tabIndex}
            aria-disabled={attributes["aria-disabled"]}
            aria-pressed={attributes["aria-pressed"]}
            aria-roledescription={attributes["aria-roledescription"]}
            aria-describedby={attributes["aria-describedby"]}
            onPointerDown={listeners?.onPointerDown as React.PointerEventHandler<HTMLDivElement> | undefined}
            onMouseDown={listeners?.onMouseDown as React.MouseEventHandler<HTMLDivElement> | undefined}
            onTouchStart={listeners?.onTouchStart as React.TouchEventHandler<HTMLDivElement> | undefined}
            onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler<HTMLDivElement> | undefined}
            style={style}
            data-dnd-card
            data-dnd-draggable="true"
            layout
            initial={false}
            animate={{
                opacity: isDragging ? 0.5 : isComplete ? 0.4 : 1,
                scale: isDragging ? 1.02 : 1,
                boxShadow: isDragging
                    ? "0 12px 40px rgba(0,0,0,0.3), 0 0 20px rgba(232,164,74,0.06)"
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
            />
        </motion.div>
    );
}
