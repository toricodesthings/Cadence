import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Task } from "../../types/task";
import { EffortDots } from "../tasks/EffortDots";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";

function DraggableTaskItem({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        data: { type: "SidebarTask", taskId: task.id },
    });

    const style = {
        transform: CSS.Translate.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => onSelect(task.id)}
            className={`
                group relative flex flex-col gap-2 p-3 rounded-xl border transition-colors cursor-pointer text-left
                ${isDragging ? "opacity-30 border-lantern ring-2 ring-lantern/20" : "border-[1.5px] border-twilight-border/40 hover:bg-white/[0.035] hover:glow-lantern bg-twilight-surface/50 glass"}
            `}
        >
            <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] leading-snug line-clamp-2 text-twilight-text">
                    {task.title}
                </span>
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-grab -mr-1 text-twilight-text-muted hover:text-twilight-text"
                    aria-label="Drag to schedule"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical size={14} />
                </button>
            </div>
            {(task.effort || task.waitingOn || task.notBefore) && (
                <div className="flex items-center flex-wrap gap-2 text-[11px] mt-1 pl-1">
                    {task.effort && (
                        <div className="inline-flex items-center">
                            <EffortDots effort={task.effort} />
                        </div>
                    )}
                    {task.waitingOn && (
                        <span className="text-moonlit/80 italic truncate max-w-[120px]">
                            Waiting
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export function UnscheduledTasksSidebar({ tasks, onSelectTask }: { tasks: Task[]; onSelectTask: (id: string) => void }) {
    return (
        <div className="flex flex-col h-full bg-twilight-deep border-l border-twilight-border">
            <div className="px-5 py-4 border-b border-twilight-border/30 shrink-0">
                <h3 className="text-[12px] font-display font-medium text-twilight-text-muted/90 uppercase tracking-wider flex items-center justify-between">
                    Unscheduled
                    <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-twilight-backdrop/30 text-twilight-text-muted text-[11px] font-mono leading-none border border-twilight-border/40">
                        {tasks.length}
                    </span>
                </h3>
            </div>

            <ScrollAreaWrapper>
                <div className="p-4 flex flex-col gap-2">
                    {tasks.map((t) => (
                        <DraggableTaskItem key={t.id} task={t} onSelect={onSelectTask} />
                    ))}

                    {tasks.length === 0 && (
                        <div className="text-center p-6 border-2 border-dashed border-twilight-border/30 rounded-xl mt-2 text-twilight-text-muted/50 text-sm italic">
                            All caught up!
                        </div>
                    )}
                </div>
            </ScrollAreaWrapper>
        </div>
    );
}
