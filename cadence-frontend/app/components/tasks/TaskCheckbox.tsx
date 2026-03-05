import { useUpdateTask } from "../../hooks/tasks";
import type { Task, TaskState } from "../../types/task";
import { Pause } from "lucide-react";

interface TaskCheckboxProps {
    task: Task;
}

/** Circular checkbox that toggles task between states */
export function TaskCheckbox({ task }: TaskCheckboxProps) {
    const updateTask = useUpdateTask();
    const isComplete = task.state === "COMPLETE";
    const isWaiting = task.state === "WAITING";

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent card expansion click
        let nextState: TaskState = "COMPLETE";

        if (isComplete) nextState = "ACTIVE";
        else if (isWaiting) nextState = "COMPLETE";
        else nextState = "COMPLETE";

        updateTask.mutate({
            id: task.id,
            state: nextState,
        });
    };

    return (
        <button
            onClick={handleToggle}
            type="button"
            className={`mt-0.5 w-5 h-5 rounded-full border-[1.5px] shrink-0
        flex items-center justify-center transition-[background-color,border-color] duration-200 cursor-pointer
        ${isComplete
                    ? "bg-lantern/20 border-lantern text-lantern"
                    : isWaiting
                        ? "border-moonlit/80 text-moonlit/80 hover:border-moonlit"
                        : "border-twilight-text-muted/70 hover:border-lantern/50"
                }`}
            aria-label={isComplete ? "Mark incomplete" : isWaiting ? "Finish waiting" : "Mark complete"}
        >
            {isComplete && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-lantern">
                    <path
                        d="M2 5L4 7L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )}
            {isWaiting && !isComplete && (
                <Pause className="w-2.5 h-2.5" />
            )}
        </button>
    );
}
