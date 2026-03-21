import React from "react";
import { Pin, Pencil, Copy, ListChecks, Trash2 } from "lucide-react";
import * as ContextMenu from "../primitives/ContextMenu";
import { useArchiveTask, useUpdateTask, useDuplicateTask } from "../../hooks/tasks";
import type { Task } from "../../types/task";

export interface TaskContextMenuWrapperProps {
    task: Task;
    children: React.ReactNode;
    onAddSubtask?: () => void;
    onRename?: () => void;
}

/** Quick-action context menu for right-click on task cards.
 *  Deep scheduling, tags, effort, and section flows live in the edit panel. */
export function TaskContextMenuWrapper({ task, children, onAddSubtask, onRename }: TaskContextMenuWrapperProps) {
    const archiveTask = useArchiveTask();
    const updateTask = useUpdateTask();
    const duplicateTask = useDuplicateTask();

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger className="block w-full">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Content className="w-56">
                <ContextMenu.Item onClick={() => updateTask.mutate({ id: task.id, isPinned: !task.isPinned })}>
                    <div className="flex items-center gap-2">
                        <Pin size={16} className={task.isPinned ? "fill-lantern text-lantern" : ""} />
                        <span>{task.isPinned ? "Unpin task" : "Pin to top"}</span>
                    </div>
                </ContextMenu.Item>

                {onRename && (
                    <ContextMenu.Item onClick={onRename}>
                        <div className="flex items-center gap-2">
                            <Pencil size={16} />
                            <span>Rename</span>
                        </div>
                    </ContextMenu.Item>
                )}

                <ContextMenu.Item onClick={() => duplicateTask.mutate(task.id)}>
                    <div className="flex items-center gap-2">
                        <Copy size={16} />
                        <span>Duplicate</span>
                    </div>
                </ContextMenu.Item>

                {onAddSubtask && (
                    <ContextMenu.Item onClick={onAddSubtask}>
                        <div className="flex items-center gap-2">
                            <ListChecks size={16} />
                            <span>Add subtask</span>
                        </div>
                    </ContextMenu.Item>
                )}

                <ContextMenu.Separator />

                <ContextMenu.Item onSelect={() => archiveTask.mutate(task.id)} variant="danger">
                    <div className="flex items-center gap-2">
                        <Trash2 size={16} />
                        <span>Move to Trash</span>
                    </div>
                </ContextMenu.Item>
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
