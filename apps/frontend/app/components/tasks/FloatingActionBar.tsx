import { X, Calendar, CheckSquare, Trash2, CalendarDays, Sun, Moon, ArrowRight, Archive, FolderOpen, Hash } from "lucide-react";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useBatchStateTransition, useBatchDeleteTasks, useBatchRescheduleTasks } from "../../hooks/tasks/use-batch-state";
import { useUpdateTask } from "../../hooks/tasks";
import { useProjects } from "../../hooks/projects";
import { useTags, useAddTaskTag } from "../../hooks/tags";
import { toast } from "sonner";
import * as Popover from "../primitives/Popover";
import { Button } from "../primitives/Button";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { toISODate, addDays } from "../../lib/utils/date-format";

export function FloatingActionBar() {
    const { selectedTaskIds, clearSelection } = useTaskSelectionStore();

    // Convert Set back to Array for hooks
    const selectedArray = Array.from(selectedTaskIds);

    const count = selectedArray.length;

    const batchState = useBatchStateTransition();
    const batchDelete = useBatchDeleteTasks();
    const batchReschedule = useBatchRescheduleTasks();
    const updateTask = useUpdateTask();
    const addTaskTag = useAddTaskTag();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();

    if (count === 0) return null;

    const handleMarkComplete = () => {
        batchState.mutate(
            { taskIds: selectedArray, state: "COMPLETE" },
            {
                onSuccess: () => {
                    toast.success(`Marked ${count} tasks complete`);
                    clearSelection();
                }
            }
        );
    };

    const handleDelete = () => {
        batchDelete.mutate(
            { taskIds: selectedArray },
            {
                onSuccess: () => {
                    toast.success(`Deleted ${count} tasks`);
                    clearSelection();
                }
            }
        );
    };

    const handleArchive = () => {
        batchState.mutate(
            { taskIds: selectedArray, state: "ARCHIVED" },
            {
                onSuccess: () => {
                    toast.success(`Archived ${count} tasks`);
                    clearSelection();
                },
            },
        );
    };

    const handleReschedule = (updates: any) => {
        if (!updates.scheduledStart) return;
        batchReschedule.mutate(
            {
                taskIds: selectedArray,
                scheduledStart: updates.scheduledStart,
                isAllDay: updates.isAllDay ?? true
            },
            {
                onSuccess: () => {
                    toast.success(`Rescheduled ${count} tasks`);
                    clearSelection();
                }
            }
        );
    };

    const handleQuickReschedule = (daysFromNow: number) => {
        const target = toISODate(addDays(new Date(), daysFromNow));
        batchReschedule.mutate(
            { taskIds: selectedArray, scheduledStart: target, isAllDay: true },
            {
                onSuccess: () => {
                    toast.success(`Rescheduled ${count} tasks`);
                    clearSelection();
                },
            },
        );
    };

    const handleMove = async (projectId: string | null) => {
        await Promise.all(
            selectedArray.map((taskId) =>
                updateTask.mutateAsync({ id: taskId, projectId, sectionId: null }),
            ),
        );
        toast.success(projectId ? `Moved ${count} tasks` : `Returned ${count} tasks to Holding`);
        clearSelection();
    };

    const handleTag = async (tagId: string) => {
        await Promise.all(
            selectedArray.map((taskId) => addTaskTag.mutateAsync({ taskId, tagId })),
        );
        toast.success(`Tagged ${count} tasks`);
        clearSelection();
    };

    return (
        <div className="layer-floating-bar fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl border border-twilight-border bg-twilight-surface p-1.5 shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
            {/* Count Badge */}
            <div className="flex items-center justify-center gap-2 pl-3 pr-2 border-r border-twilight-border/50">
                <span className="flex h-5 items-center justify-center rounded-full bg-lantern/20 px-2 text-[11px] font-bold text-lantern tracking-wide">
                    {count}
                </span>
                <span className="text-[11px] font-medium text-twilight-text-muted uppercase tracking-wide">
                    selected
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 px-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkComplete}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <CheckSquare size={14} className="opacity-80" />
                    Complete
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleArchive}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <Archive size={14} className="opacity-80" />
                    Archive
                </Button>

                {/* Quick reschedule presets */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickReschedule(0)}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <Sun size={14} className="opacity-80" />
                    Today
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickReschedule(1)}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <Moon size={14} className="opacity-80" />
                    Tomorrow
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickReschedule(7)}
                    className="shrink-0 text-twilight-text-soft hover:text-white hidden sm:flex"
                >
                    <ArrowRight size={14} className="opacity-80" />
                    Next week
                </Button>

                <DeadlinePickerPopover
                    dueDate={null}
                    scheduledStart={null}
                    recurrenceRule={null}
                    onChange={handleReschedule}
                >
                    <Button variant="ghost" size="sm" className="shrink-0 text-twilight-text-soft hover:text-white">
                        <Calendar size={14} className="opacity-80" />
                        Reschedule
                    </Button>
                </DeadlinePickerPopover>

                <Popover.Root>
                    <Popover.Trigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0 text-twilight-text-soft hover:text-white">
                            <FolderOpen size={14} className="opacity-80" />
                            Move
                        </Button>
                    </Popover.Trigger>
                    <Popover.Content className="w-52 p-1">
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={() => void handleMove(null)}
                                className="flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm text-twilight-text-soft hover:bg-white/[0.05]"
                            >
                                Holding
                            </button>
                            {projects.map((project) => (
                                <button
                                    key={project.id}
                                    type="button"
                                    onClick={() => void handleMove(project.id)}
                                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-twilight-text-soft hover:bg-white/[0.05]"
                                >
                                    {project.emoji ? <span aria-hidden="true">{project.emoji}</span> : null}
                                    <span className="truncate">{project.name}</span>
                                </button>
                            ))}
                        </div>
                    </Popover.Content>
                </Popover.Root>

                <Popover.Root>
                    <Popover.Trigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0 text-twilight-text-soft hover:text-white">
                            <Hash size={14} className="opacity-80" />
                            Tag
                        </Button>
                    </Popover.Trigger>
                    <Popover.Content className="w-52 p-1">
                        <div className="max-h-64 space-y-1 overflow-auto">
                            {tags.map((tag) => (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => void handleTag(tag.id)}
                                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-twilight-text-soft hover:bg-white/[0.05]"
                                >
                                    <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: tag.color === "default" ? "var(--color-twilight-text-muted)" : tag.color }}
                                    />
                                    <span className="truncate">{tag.name}</span>
                                </button>
                            ))}
                            {!tags.length ? (
                                <p className="px-3 py-3 text-sm text-twilight-text-muted">Create a tag first.</p>
                            ) : null}
                        </div>
                    </Popover.Content>
                </Popover.Root>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="shrink-0 text-rose-400 opacity-90 hover:opacity-100"
                >
                    <Trash2 size={14} />
                    Delete
                </Button>
            </div>

            {/* Dismiss */}
            <div className="pl-1 pr-1 border-l border-twilight-border/50">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearSelection}
                    aria-label="Clear selection"
                    className="h-7 w-7 hover:text-white"
                >
                    <X size={14} />
                </Button>
            </div>
        </div>
    );
}
