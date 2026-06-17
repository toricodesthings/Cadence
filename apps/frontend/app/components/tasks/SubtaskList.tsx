import React, { useState } from "react";
import { X, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask, useReorderSubtasks } from "../../hooks/tasks/use-subtasks";
import { TaskCheckbox } from "./TaskCheckbox";
import { SortableSubtaskList, type SortableSubtaskRenderProps } from "./SortableSubtaskList";
import type { Subtask } from "@cadence/contracts/subtask";

interface EditableSubtaskRowProps extends SortableSubtaskRenderProps {
    onDelete: (id: string) => void;
    onTitleChange: (id: string, newTitle: string) => void;
}

function EditableSubtaskRow({
    subtask,
    isDragging,
    dragHandleProps,
    onDelete,
    onTitleChange,
}: EditableSubtaskRowProps) {
    const [editingTitle, setEditingTitle] = useState(subtask.title);

    const handleBlur = () => {
        if (editingTitle.trim() !== subtask.title) {
            onTitleChange(subtask.id, editingTitle.trim() || subtask.title);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group flex items-center gap-2 py-3 ${isDragging ? "opacity-50" : "opacity-100"}`}
        >
            <div
                ref={dragHandleProps.ref}
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                className="shrink-0 rounded-xl p-0.5 text-twilight-text-muted/50 opacity-60 transition-opacity hover:bg-white/[0.04] hover:text-twilight-text-muted group-hover:opacity-100 touch-reveal cursor-grab"
                data-no-dnd="true"
                data-no-open="true"
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
                className={`flex-1 min-w-0 bg-transparent outline-none text-[14px] leading-6 transition-all duration-300 ${
                    subtask.isComplete ? "text-twilight-text-muted/50 line-through" : "text-twilight-text"
                }`}
            />

            <button
                type="button"
                onClick={() => onDelete(subtask.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-twilight-text-muted/50 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 touch-reveal"
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

    const handleCreate = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && newTitle.trim()) {
            const orderIndex = subtasks.length > 0 ? subtasks[subtasks.length - 1].orderIndex + 1 : 0;
            createSubtask.mutate({ title: newTitle.trim(), orderIndex });
            setNewTitle("");
        }
    };

    if (isLoading) return null;

    return (
        <div className="mt-4 border-t border-twilight-border/40 pt-4">
            <span className="flex items-center justify-between pl-1 text-[11px] font-display font-semibold uppercase tracking-wider text-twilight-text-muted/50">
                Subtasks
            </span>

            <div className="mt-2">
                <SortableSubtaskList
                    subtasks={subtasks}
                    onReorder={(payload) => reorderSubtasks.mutate(payload)}
                    renderItem={(props) => (
                        <EditableSubtaskRow
                            {...props}
                            onDelete={(id) => deleteSubtask.mutate(id)}
                            onTitleChange={(id, title) => updateSubtask.mutate({ id, title })}
                        />
                    )}
                />

                <div className="mt-2 flex items-center gap-2 py-2 pl-12">
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
