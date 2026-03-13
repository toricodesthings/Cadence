import React, { useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask, useReorderSubtasks } from "../../hooks/use-subtasks";
import { TaskCheckbox } from "./TaskCheckbox";
import type { Subtask } from "../../types/task";

function computeMidpointIndex(prevIndex: number | null, nextIndex: number | null): number {
    if (prevIndex === null && nextIndex === null) return 0;
    if (prevIndex === null) return nextIndex! - 1;
    if (nextIndex === null) return prevIndex! + 1;
    return (prevIndex + nextIndex) / 2;
}

interface SortableSubtaskItemProps {
    subtask: Subtask;
    onToggle: (id: string, isComplete: boolean) => void;
    onDelete: (id: string) => void;
    onTitleChange: (id: string, newTitle: string) => void;
}

function SortableSubtaskItem({ subtask, onToggle, onDelete, onTitleChange }: SortableSubtaskItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: subtask.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const [editingTitle, setEditingTitle] = useState(subtask.title);

    const handleBlur = () => {
        if (editingTitle.trim() !== subtask.title) {
            onTitleChange(subtask.id, editingTitle.trim() || subtask.title);
        }
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className={`group flex items-center gap-3 py-3 ${isDragging ? "opacity-50" : "opacity-100"}`}
        >
            <div
                {...attributes}
                {...listeners}
                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hover:bg-white/[0.04] p-1 rounded-xl text-twilight-text-muted/50 hover:text-twilight-text-muted shrink-0"
            >
                <GripVertical size={16} />
            </div>

            <TaskCheckbox subtask={subtask} compact />

            <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={`flex-1 min-w-0 bg-transparent outline-none text-[14px] leading-6 transition-all duration-300 ${subtask.isComplete
                    ? "text-twilight-text-muted/50 line-through"
                    : "text-twilight-text"
                    }`}
            />

            <button
                onClick={() => onDelete(subtask.id)}
                className="h-9 w-9 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl hover:bg-red-500/10 text-twilight-text-muted/50 hover:text-red-400 shrink-0"
                aria-label="Delete subtask"
            >
                <X size={16} />
            </button>
        </motion.div>
    );
}

export function SubtaskList({ taskId }: { taskId: string }) {
    const { data: subtasks = [], isLoading } = useSubtasks(taskId);
    const createSubtask = useCreateSubtask(taskId);
    const updateSubtask = useUpdateSubtask(taskId);
    const deleteSubtask = useDeleteSubtask(taskId);
    const reorderSubtasks = useReorderSubtasks(taskId);

    const [newTitle, setNewTitle] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleCreate = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && newTitle.trim()) {
            const orderIndex = subtasks.length > 0 ? subtasks[subtasks.length - 1].orderIndex + 1 : 0;
            createSubtask.mutate({ title: newTitle.trim(), orderIndex });
            setNewTitle("");
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = subtasks.findIndex((s) => s.id === active.id);
        const newIndex = subtasks.findIndex((s) => s.id === over.id);

        const newItems = arrayMove(subtasks, oldIndex, newIndex);

        let prevIndex: number | null = null;
        let nextIndex: number | null = null;

        if (newIndex > 0) prevIndex = newItems[newIndex - 1].orderIndex;
        if (newIndex < newItems.length - 1) nextIndex = newItems[newIndex + 1].orderIndex;

        const newOrderIndex = computeMidpointIndex(prevIndex, nextIndex);
        reorderSubtasks.mutate({ id: String(active.id), newOrderIndex });
    };

    if (isLoading) return null;

    return (
        <div className="mt-4 border-t border-twilight-border/40 pt-4">
            <span className="flex items-center justify-between pl-1 text-[11px] font-display font-semibold uppercase tracking-wider text-twilight-text-muted/50">
                Subtasks
            </span>

            <div className="mt-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        <AnimatePresence>
                            {subtasks.map((subtask) => (
                                <SortableSubtaskItem
                                    key={subtask.id}
                                    subtask={subtask}
                                    onToggle={(id, isComplete) => updateSubtask.mutate({ id, isComplete })}
                                    onDelete={(id) => deleteSubtask.mutate(id)}
                                    onTitleChange={(id, title) => updateSubtask.mutate({ id, title })}
                                />
                            ))}
                        </AnimatePresence>
                    </SortableContext>
                </DndContext>

                <div className="mt-2 flex items-center gap-3 py-2 pl-14">
                    <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={handleCreate}
                        placeholder="Add a subtask…"
                        className="w-full bg-transparent text-[14px] leading-6 text-twilight-text-muted/90 outline-none placeholder:text-twilight-text-muted/80"
                    />
                </div>
            </div>
        </div>
    );
}
