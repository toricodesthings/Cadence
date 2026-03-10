import React from "react";
import * as ContextMenu from "../primitives/ContextMenu";
import { TaskMenuItems } from "./TaskContextMenu";
import type { Task } from "../../types/task";

export interface TaskContextMenuWrapperProps {
    task: Task;
    children: React.ReactNode;
    onAddSubtask?: () => void;
}

export function TaskContextMenuWrapper({ task, children, onAddSubtask }: TaskContextMenuWrapperProps) {
    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger className="block w-full">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Content className="w-64">
                <TaskMenuItems task={task} onAddSubtask={onAddSubtask} MenuComponents={ContextMenu} />
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
