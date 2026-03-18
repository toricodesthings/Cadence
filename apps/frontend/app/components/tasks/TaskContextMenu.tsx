import { useState } from "react";
import { MoreVertical, Pin, Copy, Trash2, Calendar, Bell, Sun, Moon, CalendarDays, ArrowRight, CalendarClock, X, ListChecks, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ContextMenu from "../primitives/ContextMenu";
import { Button } from "../primitives/Button";
import { useDeleteTask, useUpdateTask, useDuplicateTask } from "../../hooks/tasks";
import { useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags";
import { PriorityPicker } from "./PriorityPicker";
import { EffortPicker } from "./EffortPicker";
import { QuickScheduleSurface } from "./QuickScheduleSurface";
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
    onCloseMenu?: () => void;
}

/** Reusable inner items for either DropdownMenu or ContextMenu */
export function TaskMenuItems({ task, onAddSubtask, onRename, MenuComponents: Menu, onCloseMenu }: TaskMenuItemsProps) {
    const deleteTask = useDeleteTask();
    const updateTask = useUpdateTask();
    const duplicateTask = useDuplicateTask();
    const addTaskTag = useAddTaskTag();
    const removeTaskTag = useRemoveTaskTag();
    const [menuView, setMenuView] = useState<"main" | "reschedule-presets" | "reschedule-custom">("main");

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
        onCloseMenu?.();
    };

    if (menuView !== "main") {
        return (
            <div className="-m-1 overflow-hidden">
                <div className="flex items-center justify-between border-b border-twilight-border/40 px-4 py-3">
                    <button
                        type="button"
                        onClick={() => setMenuView("main")}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-twilight-text-muted transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                    >
                        <ChevronLeft size={13} aria-hidden="true" />
                        Back
                    </button>
                    <p className="text-sm font-semibold text-twilight-text">
                        {menuView === "reschedule-custom" ? "Custom schedule" : "Reschedule task"}
                    </p>
                    <button
                        type="button"
                        onClick={() => onCloseMenu?.()}
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-twilight-text-muted transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                        aria-label="Close task menu"
                    >
                        <X size={14} aria-hidden="true" />
                    </button>
                </div>

                {menuView === "reschedule-presets" ? (
                    <div className="p-3">
                        <div className="px-1 pb-3">
                            <p className="text-sm font-semibold text-twilight-text">Choose a date fast</p>
                            <p className="mt-1 text-xs leading-relaxed text-twilight-text-muted">
                                Pick a quick preset or open the full scheduler without leaving the task menu.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => handleQuickSchedule(0)}
                                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <Sun size={16} className="text-lantern" aria-hidden="true" />
                                <span>Today</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickSchedule(1)}
                                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <Moon size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>Tomorrow</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickSchedule(0, false, true)}
                                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <ArrowRight size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>Next week</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickSchedule(0, true)}
                                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <CalendarDays size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>Weekend</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickSchedule(3)}
                                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <CalendarClock size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>3 days</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMenuView("reschedule-custom")}
                                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-lantern/18 bg-lantern/10 px-3 py-3 text-xs font-medium text-lantern transition-colors hover:bg-lantern/14"
                            >
                                <Calendar size={16} aria-hidden="true" />
                                <span>Custom</span>
                            </button>
                        </div>

                        <div className="mt-3 border-t border-twilight-border/35 pt-3">
                            <button
                                type="button"
                                onClick={() => {
                                    updateTask.mutate({ id: task.id, scheduledStart: null, scheduledEnd: null, dueDate: null, isAllDay: true });
                                    onCloseMenu?.();
                                }}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            >
                                <X size={14} aria-hidden="true" />
                                <span>Remove date</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <QuickScheduleSurface
                        dueDate={task.dueDate}
                        scheduledStart={task.scheduledStart}
                        scheduledEnd={task.scheduledEnd}
                        recurrenceRule={task.recurrenceRule}
                        isOpen={menuView === "reschedule-custom"}
                        onChange={(updates) => updateTask.mutate({ id: task.id, ...updates })}
                        onRequestClose={() => setMenuView("reschedule-presets")}
                    />
                )}
            </div>
        );
    }

    return (
        <>
            {/* ── Scheduling & Time ── */}
            <Menu.Item
                onSelect={(event) => {
                    event.preventDefault();
                    setMenuView("reschedule-presets");
                }}
            >
                <div className="flex w-full items-center gap-2">
                    <CalendarClock size={16} />
                    <span>Reschedule</span>
                    <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-twilight-text-muted/90">
                        <span>S</span>
                        <ChevronRight size={13} aria-hidden="true" />
                    </span>
                </div>
            </Menu.Item>

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
    const [open, setOpen] = useState(false);

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Open actions for ${task.title}`}>
                    <MoreVertical size={16} />
                </Button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content className="w-[22rem]" side="right" align="start" sideOffset={8}>
                <TaskMenuItems
                    task={task}
                    onAddSubtask={onAddSubtask}
                    onRename={onRename}
                    MenuComponents={DropdownMenu}
                    onCloseMenu={() => setOpen(false)}
                />
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
