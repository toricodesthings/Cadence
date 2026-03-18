import React from "react";
import * as ContextMenu from "../primitives/ContextMenu";
import { TaskMenuItems } from "./TaskContextMenu";
import type { Task } from "../../types/task";

export interface TaskContextMenuWrapperProps {
    task: Task;
    children: React.ReactNode;
    onAddSubtask?: () => void;
    onRename?: () => void;
}

export function TaskContextMenuWrapper({ task, children, onAddSubtask, onRename }: TaskContextMenuWrapperProps) {
    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger className="block w-full">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Content className="w-[22rem]">
                <TaskMenuItems
                    task={task}
                    onAddSubtask={onAddSubtask}
                    onRename={onRename}
                    MenuComponents={ContextMenu}
                />
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
