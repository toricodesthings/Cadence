import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EffortDots } from "../tasks/EffortDots";
import { TaskCheckbox } from "../tasks/TaskCheckbox";
import { GripVertical } from "lucide-react";
import { useSubtasks } from "../../hooks/use-subtasks";
import type { Task } from "../../types/task";

interface KanbanCardProps {
    task: Task;
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

export function KanbanCard({ task, onClick, isSelected }: KanbanCardProps) {
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
    const { data: subtasks = [] } = useSubtasks(task.id);
    const completedSubtasks = subtasks.filter(s => s.isComplete).length;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group relative flex flex-col gap-3 glass-surface rounded-2xl p-4 overflow-hidden
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
                    className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_BAR_CLASS[task.priority]}`}
                    aria-hidden="true"
                />
            )}

            <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                    <TaskCheckbox task={task} />
                    <span
                        className={`text-[14px] leading-snug line-clamp-2 ${isComplete ? "line-through text-twilight-text-muted" : "text-twilight-text"}`}
                    >
                        {task.title}
                    </span>
                </div>
                {/* Drag handle */}
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 cursor-grab -mr-1 text-twilight-text-muted hover:text-twilight-text"
                    aria-label="Drag to move card"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical size={14} aria-hidden="true" />
                </button>
            </div>

            {(task.effort || task.waitingOn || task.notBefore || subtasks.length > 0) && (
                <div className="flex items-center flex-wrap gap-2 text-[11px] mt-1 pl-7">
                    {subtasks.length > 0 && (
                        <div className="inline-flex items-center gap-1.5 text-twilight-text-muted">
                            <span className="flex h-1.5 w-5 overflow-hidden rounded-full bg-white/[0.04]">
                                <span
                                    className="h-full bg-feedback-success/60 transition-all duration-300"
                                    style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                />
                            </span>
                            {completedSubtasks}/{subtasks.length}
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
