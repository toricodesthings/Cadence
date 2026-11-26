import React from "react";
import * as ContextMenu from "../primitives/ContextMenu";
import { TaskMenuItems } from "./TaskContextMenu";
import { trackUsageEvent } from "../../lib/api/track-event";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { Task } from "@cadence/contracts/task";

export interface TaskContextMenuWrapperProps {
    task: Task;
    children: React.ReactNode;
    onAddSubtask?: () => void;
    onRename?: () => void;
    onOpen?: () => void;
    holdingContext?: boolean;
}

export function TaskContextMenuWrapper({
    task,
    children,
    onAddSubtask,
    onRename,
    onOpen,
    holdingContext,
}: TaskContextMenuWrapperProps) {
    const shell = useShellMode();
    if (shell.isCompact) return <>{children}</>;

    return (
        <ContextMenu.Root
            onOpenChange={(isOpen) => {
                if (isOpen)
                    trackUsageEvent("task.context_menu_opened", { object_type: "task", input_method: "context_menu" });
            }}
        >
            <ContextMenu.Trigger className="block w-full">{children}</ContextMenu.Trigger>
            <ContextMenu.Content className="w-[22rem]">
                <TaskMenuItems
                    task={task}
                    onAddSubtask={onAddSubtask}
                    onRename={onRename}
                    onOpen={onOpen}
                    MenuComponents={ContextMenu}
                    holdingContext={holdingContext}
                />
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
