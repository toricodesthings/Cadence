import { useState } from "react";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useTasks, useRestoreTask, useDeleteTask } from "../hooks/tasks";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { PageContent } from "../components/layout/PageLayout";
import { Button } from "../components/primitives/Button";
import { formatShortDate } from "../lib/utils/date-format";
import type { Task } from "../types/task";

function TrashTaskRow({ task }: { task: Task }) {
    const restoreTask = useRestoreTask();
    const deleteTask = useDeleteTask();
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div className="group flex items-center gap-3 rounded-2xl border border-twilight-border/30 bg-twilight-surface/40 px-4 py-3 transition-colors hover:bg-twilight-surface-hover/40">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-twilight-text">{task.title}</p>
                {task.updatedAt && (
                    <p className="mt-0.5 text-xs text-twilight-text-muted">
                        Moved to trash {formatShortDate(task.updatedAt)}
                    </p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => restoreTask.mutate(task.id)}
                    className="text-forest-green hover:text-forest-green"
                    aria-label={`Restore "${task.title}"`}
                >
                    <RotateCcw size={14} className="mr-1.5" />
                    Restore
                </Button>
                {confirmDelete ? (
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTask.mutate(task.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                            Delete forever
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(true)}
                        className="text-twilight-text-muted hover:text-red-400"
                        aria-label={`Permanently delete "${task.title}"`}
                    >
                        <Trash2 size={14} />
                    </Button>
                )}
            </div>
        </div>
    );
}

export default function TrashView() {
    const { data: tasks, isLoading } = useTasks({ state: "ARCHIVED" });

    return (
        <MainLayout
            requireAuth
            contentWidth="default"
            shellHeader={{
                title: "Trash",
                eyebrow: "Recovery",
                icon: <Trash2 size={18} aria-hidden="true" />,
                accentColor: "var(--color-priority-urgent)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="default">
                    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-twilight-border/20 bg-twilight-surface/30 px-4 py-3">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-lantern/70" />
                        <p className="text-xs leading-relaxed text-twilight-text-muted">
                            Tasks here can be restored to your active workspace. Permanently deleting a task cannot be undone.
                        </p>
                    </div>

                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : tasks && tasks.length > 0 ? (
                        <div className="space-y-2">
                            {tasks.map((task) => (
                                <TrashTaskRow key={task.id} task={task} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                            <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                                <Trash2 size={24} className="text-twilight-text-muted" />
                            </div>
                            <h3 className="text-lg font-medium text-twilight-text mb-2">Trash is empty</h3>
                            <p className="text-twilight-text-muted text-sm max-w-sm">
                                When you move tasks to trash, they&apos;ll appear here for recovery.
                            </p>
                        </div>
                    )}
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
