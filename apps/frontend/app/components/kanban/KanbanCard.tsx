import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EffortDots } from "../tasks/EffortDots";
import { TaskCheckbox } from "../tasks/TaskCheckbox";
import { GripVertical } from "lucide-react";
import type { Task, Subtask } from "../../types/task";

interface KanbanCardProps {
    task: Task;
    subtasks?: Subtask[];
    onClick: (id: string) => void;
    isSelected: boolean;
}

const PRIORITY_BAR_CLASS: Record<number, string> = {
    0: "",
    1: "bg-[var(--color-priority-low)]",
    2: "bg-[var(--color-priority-medium)]",
    3: "bg-[var(--color-priority-high)] priority-high-bar",
    4: "bg-[var(--color-priority-urgent)] priority-urgent-bar",
};

export function KanbanCard({ task, subtasks = [], onClick, isSelected }: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id, data: { type: "Task", task } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isComplete = task.state === "COMPLETE";
    const completedSubtasks = subtasks.filter(s => s.isComplete).length;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group relative flex flex-col gap-2.5 glass-surface rounded-2xl px-3 py-3.5 overflow-hidden
                transition-[background-color,border-color,box-shadow,opacity] duration-200 cursor-pointer
                ${isDragging ? "opacity-30 border-lantern ring-2 ring-lantern/20" : "border-transparent border-[1.5px] border-twilight-border/40"}
                ${isComplete ? "opacity-50" : ""}
                ${isSelected ? "bg-white/[0.05] ring-1 ring-lantern/30" : "hover:bg-white/[0.035] hover:glow-lantern"}
            `}
            onClick={() => onClick(task.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick(task.id);
                }
            }}
        >
            {/* Priority Bar */}
            {task.priority > 0 && (
                <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${PRIORITY_BAR_CLASS[task.priority]}`}
                    aria-hidden="true"
                />
            )}

            <div className="grid grid-cols-[auto,minmax(0,1fr),auto] items-start gap-x-2">
                <div className="pt-0.5">
                    <TaskCheckbox task={task} compact />
                </div>
                <span
                    className={`min-w-0 text-[15px] leading-[1.4] ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                >
                    {task.title}
                </span>
                {/* Drag handle */}
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="mt-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 cursor-grab text-twilight-text-muted hover:text-twilight-text"
                    aria-label="Drag to move card"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical size={14} aria-hidden="true" />
                </button>
            </div>

            {(task.effort || task.waitingOn || task.notBefore || subtasks.length > 0) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]">
                    {subtasks.length > 0 && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-twilight-border/40 bg-white/[0.03] px-2.5 py-1 text-twilight-text-soft">
                            <span className="flex h-1.5 w-7 overflow-hidden rounded-full bg-white/[0.04]">
                                <span
                                    className="h-full bg-feedback-success/60 transition-all duration-300"
                                    style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                />
                            </span>
                            {completedSubtasks}/{subtasks.length} subtasks
                        </div>
                    )}
                    {task.effort && (
                        <div className="inline-flex items-center">
                            <EffortDots effort={task.effort} />
                        </div>
                    )}
                    {task.waitingOn && (
                        <span className="text-moonlit/80 italic truncate max-w-[120px]">
                            Waiting: {task.waitingOn}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
