import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { X, type LucideIcon, Calendar, CheckSquare, Trash2, Sun, Moon, ArrowRight, Archive, FolderOpen, Hash } from "lucide-react";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useBatchStateTransition, useBatchDeleteTasks, useBatchRescheduleTasks, useTrashTasks } from "../../hooks/tasks/use-batch-state";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useAddTaskTag } from "../../hooks/tags/use-task-tags";
import * as Popover from "../primitives/Popover";
import { Button } from "../primitives/Button";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { addDays } from "@cadence/domain/time";
import { today } from "../../lib/utils/user-zone";
import type { ScheduleUpdates } from "./QuickScheduleSurface";

function BarButton({ icon: Icon, label, className, ...rest }: { icon: LucideIcon; label: string } & Omit<ComponentProps<typeof Button>, "children" | "variant" | "size">) {
    return (
        <Button variant="ghost" size="sm" className={cn("shrink-0 text-twilight-text-soft hover:text-white", className)} {...rest}>
            <Icon size={14} className="opacity-80" />
            {label}
        </Button>
    );
}

export function FloatingActionBar() {
    const { selectedTaskIds, clearSelection } = useTaskSelectionStore();

    // Convert Set back to Array for hooks
    const selectedArray = Array.from(selectedTaskIds);

    const count = selectedArray.length;

    const batchState = useBatchStateTransition();
    const batchDelete = useBatchDeleteTasks();
    const trashTasks = useTrashTasks();
    const batchReschedule = useBatchRescheduleTasks();
    const updateTask = useUpdateTask();
    const addTaskTag = useAddTaskTag();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();

    if (count === 0) return null;

    const handleMarkComplete = () => {
        batchState.mutate(
            { taskIds: selectedArray, state: "COMPLETE" },
            { onSuccess: clearSelection }
        );
    };

    const handleDelete = () => {
        // Off the screen at once; the Undo toast (in the hook) holds the real delete back.
        batchDelete.mutate({ taskIds: selectedArray });
        clearSelection();
    };

    const handleArchive = () => trashTasks(selectedArray, clearSelection);

    const handleReschedule = (updates: ScheduleUpdates) => {
        // A picked time moves tasks to that instant; a picked day moves each to the day, keeping its own time.
        const when = updates.scheduledStart ? { scheduledStart: updates.scheduledStart } : updates.dueDate ? { date: updates.dueDate } : null;
        if (!when) return;
        batchReschedule.mutate(
            { taskIds: selectedArray, ...when },
            { onSuccess: clearSelection }
        );
    };

    const handleQuickReschedule = (daysFromNow: number) => {
        batchReschedule.mutate(
            { taskIds: selectedArray, date: addDays(today(), daysFromNow) },
            { onSuccess: clearSelection },
        );
    };

    const handleMove = async (projectId: string | null) => {
        await Promise.all(
            selectedArray.map((taskId) =>
                updateTask.mutateAsync({ id: taskId, projectId, sectionId: null }),
            ),
        );
        clearSelection();
    };

    const handleTag = async (tagId: string) => {
        await Promise.all(
            selectedArray.map((taskId) => addTaskTag.mutateAsync({ taskId, tagId })),
        );
        clearSelection();
    };

    return (
        <div className="layer-floating-bar fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl border border-twilight-border bg-twilight-surface p-1.5 shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
            {/* Count Badge */}
            <div className="flex items-center justify-center gap-2 pl-3 pr-2 border-r border-twilight-border/50">
                <span className="flex h-5 items-center justify-center rounded-full bg-accent-primary/20 px-2 text-[11px] font-bold text-accent-primary tracking-wide">
                    {count}
                </span>
                <span className="text-[11px] font-medium text-twilight-text-muted uppercase tracking-wide">
                    selected
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 px-1">
                <BarButton icon={CheckSquare} label="Complete" onClick={handleMarkComplete} />

                <BarButton icon={Archive} label="Archive" onClick={handleArchive} />

                {/* Quick reschedule presets */}
                <BarButton icon={Sun} label="Today" onClick={() => handleQuickReschedule(0)} />

                <BarButton icon={Moon} label="Tomorrow" onClick={() => handleQuickReschedule(1)} />

                <BarButton icon={ArrowRight} label="Next week" onClick={() => handleQuickReschedule(7)} className="hidden sm:flex" />

                <DeadlinePickerPopover
                    dueDate={null}
                    scheduledStart={null}
                    recurrenceRule={null}
                    onChange={handleReschedule}
                >
                    <BarButton icon={Calendar} label="Reschedule" />
                </DeadlinePickerPopover>

                <Popover.Root>
                    <Popover.Trigger asChild>
                        <BarButton icon={FolderOpen} label="Move" />
                    </Popover.Trigger>
                    <Popover.Content className="w-52 p-1">
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={() => void handleMove(null)}
                                className="flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm text-twilight-text-soft hover:bg-white/[0.05]"
                            >
                                Capture
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
                        <BarButton icon={Hash} label="Tag" />
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
                                        style={{ backgroundColor: !tag.color || tag.color === "default" ? "var(--color-twilight-text-muted)" : tag.color }}
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
