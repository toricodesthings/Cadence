import React, { useState } from "react";
import * as ContextMenu from "../primitives/ContextMenu";
import { TaskMenuItems } from "./TaskContextMenu";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { Task } from "../../types/task";

export interface TaskContextMenuWrapperProps {
    task: Task;
    children: React.ReactNode;
    onAddSubtask?: () => void;
    onRename?: () => void;
    /** When true, renders a simplified shallow menu for Holding context */
    holdingContext?: boolean;
}

/** Right-click context menu for task cards — uses the same TaskMenuItems
 *  as the three-dot dropdown, so both menus expose identical actions. */
export function TaskContextMenuWrapper({ task, children, onAddSubtask, onRename, holdingContext }: TaskContextMenuWrapperProps) {
    const [open, setOpen] = useState(false);

    return (
        <ContextMenu.Root onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (isOpen) trackUsageEvent("task.context_menu_opened", { object_type: "task", input_method: "context_menu" });
        }}>
            <ContextMenu.Trigger className="block w-full">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Content className="w-[22rem]">
                <TaskMenuItems
                    task={task}
                    onAddSubtask={onAddSubtask}
                    onRename={onRename}
                    MenuComponents={ContextMenu}
                    onCloseMenu={() => setOpen(false)}
                    holdingContext={holdingContext}
                />
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
