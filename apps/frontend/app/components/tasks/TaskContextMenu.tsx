import { MoreVertical, Pin, Copy, Trash2, Calendar, Bell, Repeat, Sun, Moon, CalendarDays, ArrowRight, CalendarClock, X, ListChecks, Zap, Pencil } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ContextMenu from "../primitives/ContextMenu";
import { Button } from "../primitives/Button";
import { useDeleteTask, useUpdateTask, useDuplicateTask } from "../../hooks/tasks";
import { useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags";
import { PriorityPicker } from "./PriorityPicker";
import { EffortPicker } from "./EffortPicker";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { MoveToSubmenu } from "./MoveToSubmenu";
import { MoveToSectionSubmenu } from "./MoveToSectionSubmenu";
import { TagPickerSubmenu } from "./TagPickerSubmenu";
import type { Task } from "../../types/task";

type GenericMenu = typeof DropdownMenu | typeof ContextMenu;

export interface TaskMenuItemsProps {
    task: Task;
    onAddSubtask?: () => void;
    onRename?: () => void;
    MenuComponents: GenericMenu;
}

/** Reusable inner items for either DropdownMenu or ContextMenu */
export function TaskMenuItems({ task, onAddSubtask, onRename, MenuComponents: Menu }: TaskMenuItemsProps) {
    const deleteTask = useDeleteTask();
    const updateTask = useUpdateTask();
    const duplicateTask = useDuplicateTask();
    const addTaskTag = useAddTaskTag();
    const removeTaskTag = useRemoveTaskTag();

    const handleTogglePin = () => {
        updateTask.mutate({ id: task.id, isPinned: !task.isPinned });
    };

    const handleToggleReminder = () => {
        updateTask.mutate({
            id: task.id,
            reminderAt: task.reminderAt ? null : new Date().toISOString(),
            reminderSilenced: false,
        });
    };

    const handleQuickSchedule = (daysToAdd: number, startOfWeekend = false, nextWeek = false) => {
        const date = new Date();
        if (nextWeek) {
            date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7 || 7)); // Next Monday
        } else if (startOfWeekend) {
            date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7)); // Next Saturday
        } else {
            date.setDate(date.getDate() + daysToAdd);
        }

        // Return ISO string
        updateTask.mutate({
            id: task.id,
            dueDate: date.toISOString().split("T")[0],
            scheduledStart: null,
            scheduledEnd: null,
            isAllDay: true,
        });
    };

    return (
        <>
            {/* ── Scheduling & Time ── */}
            <Menu.Sub>
                <Menu.SubTrigger className="flex items-center gap-2">
                    <CalendarClock size={16} />
                    <span>Reschedule</span>
                    <span className="ml-auto text-[10px] text-twilight-text-muted/90">S</span>
                </Menu.SubTrigger>
                <Menu.Portal>
                    <Menu.SubContent className="w-48">
                        <Menu.Item onClick={() => handleQuickSchedule(0)}>
                            <div className="flex items-center gap-2">
                                <Sun size={14} className="text-lantern" />
                                <span>Today</span>
                            </div>
                        </Menu.Item>
                        <Menu.Item onClick={() => handleQuickSchedule(1)}>
                            <div className="flex items-center gap-2">
                                <Moon size={14} className="text-twilight-text-muted" />
                                <span>Tomorrow</span>
                            </div>
                        </Menu.Item>
                        <Menu.Item onClick={() => handleQuickSchedule(0, true)}>
                            <div className="flex items-center gap-2">
                                <CalendarDays size={14} className="text-twilight-text-muted" />
                                <span>This Weekend</span>
                            </div>
                        </Menu.Item>
                        <Menu.Item onClick={() => handleQuickSchedule(0, false, true)}>
                            <div className="flex items-center gap-2">
                                <ArrowRight size={14} className="text-twilight-text-muted" />
                                <span>Next Week</span>
                            </div>
                        </Menu.Item>
                        <Menu.Item onClick={() => handleQuickSchedule(3)}>
                            <div className="flex items-center gap-2">
                                <CalendarClock size={14} className="text-twilight-text-muted" />
                                <span>In 3 days</span>
                            </div>
                        </Menu.Item>
                        <Menu.Separator />
                        <DeadlinePickerPopover
                            dueDate={task.dueDate}
                            scheduledStart={task.scheduledStart}
                            scheduledEnd={task.scheduledEnd}
                            recurrenceRule={task.recurrenceRule}
                            onChange={(updates) => updateTask.mutate({ id: task.id, ...updates })}
                        >
                            <Menu.Item onSelect={(e) => e.preventDefault()}>
                                <div className="flex items-center gap-2">
                                    <Calendar size={14} />
                                    <span>Custom picker...</span>
                                </div>
                            </Menu.Item>
                        </DeadlinePickerPopover>
                        <Menu.Separator />
                        <Menu.Item
                            onClick={() => updateTask.mutate({ id: task.id, scheduledStart: null, scheduledEnd: null, dueDate: null, isAllDay: true })}
                            className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                        >
                            <div className="flex items-center gap-2">
                                <X size={14} />
                                <span>Remove date</span>
                            </div>
                        </Menu.Item>
                    </Menu.SubContent>
                </Menu.Portal>
            </Menu.Sub>

            <Menu.Item onClick={handleToggleReminder}>
                <div className="flex items-center gap-2">
                    <Bell size={16} />
                    <span>{task.reminderAt ? "Remove Reminder" : "Set Reminder"}</span>
                </div>
            </Menu.Item>

            <Menu.Separator />

            {/* ── Priority ── */}
            {/* The child will be wrapped in Radix primitives, make sure PriorityPicker supports Menu abstraction 
                Wait, PriorityPicker renders DropdownMenu internally! 
                We must adapt PriorityPicker too, or just render something simpler for ContextMenu.
                For now we'll allow PriorityPicker to be its own Dropdown. Note: nested dropdowns over context menu might be tricky,
                let's pass MenuComponents to PriorityPicker too if needed, or assume it's okay. 
                Wait! Radix doesn't allow a DropdownMenu trigger inside a ContextMenu item directly if it's not a Submenu. 
                Instead we will pass Menu={Menu} to PriorityPicker, MoveToSubmenu, TagPickerSubmenu. 
            */}
            <PriorityPicker
                currentPriority={task.priority}
                onSelect={(p) => updateTask.mutate({ id: task.id, priority: p })}
            />

            {/* ── Effort ── */}
            <EffortPicker
                currentEffort={task.effort}
                onSelect={(e) => updateTask.mutate({ id: task.id, effort: e })}
            />

            <Menu.Separator />

            {/* ── Organization ── */}
            <TagPickerSubmenu
                MenuComponents={Menu as GenericMenu}
                activeTagIds={task.tagIds ?? []}
                onAdd={(tagId) => addTaskTag.mutate({ taskId: task.id, tagId })}
                onRemove={(tagId) => removeTaskTag.mutate({ taskId: task.id, tagId })}
            />

            <MoveToSubmenu
                MenuComponents={Menu as GenericMenu}
                currentProjectId={task.projectId}
                onSelect={(projectId) => updateTask.mutate({ id: task.id, projectId })}
            />

            <MoveToSectionSubmenu
                MenuComponents={Menu as GenericMenu}
                currentProjectId={task.projectId}
                currentSectionId={task.sectionId ?? null}
                onSelect={(sectionId) => updateTask.mutate({ id: task.id, sectionId })}
            />

            <Menu.Separator />

            {/* ── Status & Actions ── */}
            <Menu.Item onClick={handleTogglePin}>
                <div className="flex items-center gap-2">
                    <Pin size={16} className={task.isPinned ? "fill-lantern text-lantern" : ""} />
                    <span>{task.isPinned ? "Unpin task" : "Pin to top"}</span>
                </div>
            </Menu.Item>

            <Menu.Item onClick={() => onRename?.()}>
                <div className="flex items-center gap-2">
                    <Pencil size={16} />
                    <span>Rename</span>
                </div>
            </Menu.Item>

            <Menu.Item onClick={() => duplicateTask.mutate(task.id)}>
                <div className="flex items-center gap-2">
                    <Copy size={16} />
                    <span>Duplicate</span>
                </div>
            </Menu.Item>

            {onAddSubtask && (
                <Menu.Item onClick={onAddSubtask}>
                    <div className="flex items-center gap-2">
                        <ListChecks size={16} />
                        <span>Add subtask</span>
                    </div>
                </Menu.Item>
            )}

            <Menu.Separator />

            <Menu.Item onSelect={() => deleteTask.mutate(task.id)} variant="danger">
                <div className="flex items-center gap-2">
                    <Trash2 size={16} />
                    <span>Delete</span>
                    <span className="ml-auto text-[10px] opacity-60">Del</span>
                </div>
            </Menu.Item>
        </>
    );
}

export interface TaskContextMenuProps {
    task: Task;
    onAddSubtask?: () => void;
    onRename?: () => void;
}

export function TaskContextMenu({ task, onAddSubtask, onRename }: TaskContextMenuProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Open actions for ${task.title}`}>
                    <MoreVertical size={16} />
                </Button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content className="w-72" side="right" align="start" sideOffset={8}>
                <TaskMenuItems task={task} onAddSubtask={onAddSubtask} onRename={onRename} MenuComponents={DropdownMenu} />
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
