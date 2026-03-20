import { ListTodo, ArrowRightCircle } from "lucide-react";
import { extractActionableLines } from "../../lib/notes/markdown-transforms";
import { useCreateSubtask } from "../../hooks/tasks";

interface TaskNoteConvertMenuProps {
    taskId: string;
    noteContent: string;
}

/**
 * Shows a callout when actionable lines are detected in notes,
 * allowing the user to bulk-convert them to subtasks.
 */
export function TaskNoteConvertMenu({ taskId, noteContent }: TaskNoteConvertMenuProps) {
    const createSubtask = useCreateSubtask(taskId);
    const actionableLines = extractActionableLines(noteContent);

    if (actionableLines.length === 0) return null;

    const handleConvert = () => {
        const baseOrder = Date.now();
        actionableLines.forEach((line, index) => {
            createSubtask.mutate({ title: line, orderIndex: baseOrder + index });
        });
    };

    return (
        <div className="flex items-center justify-between rounded-[1.2rem] border border-twilight-border/35 bg-white/[0.025] px-4 py-3">
            <div className="flex items-center gap-2.5">
                <ListTodo size={15} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                <div>
                    <p className="text-sm text-twilight-text">Convert to subtasks</p>
                    <p className="text-xs text-twilight-text-muted">
                        {actionableLines.length} structured line{actionableLines.length === 1 ? "" : "s"} found
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={handleConvert}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-lantern/20 bg-lantern/10 px-3 py-2 text-xs font-medium text-lantern transition-colors hover:bg-lantern/16"
            >
                <ArrowRightCircle size={13} aria-hidden="true" />
                Create subtasks
            </button>
        </div>
    );
}
