import { useState } from "react";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { UtilitySheet } from "../components/shared/UtilitySheet";
import { Trash2, RotateCcw, AlertTriangle, ChevronRight } from "lucide-react";
import { usePagedTasks } from "../hooks/tasks/use-tasks";
import { useRestoreTask } from "../hooks/tasks/use-restore-task";
import { useDeleteTask, useEmptyTrash } from "../hooks/tasks/use-delete-task";
import { useOnlineStatus } from "../hooks/core/use-online-status";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { PageContent } from "../components/layout/PageLayout";
import { Button } from "../components/primitives/Button";
import * as AlertDialog from "../components/primitives/AlertDialog";
import { formatShortDate } from "../lib/utils/date-format";
import type { Task } from "@cadence/contracts/task";

const trashedOn = (task: Task) => (task.updatedAt ? `Moved to trash ${formatShortDate(task.updatedAt)}` : null);

/** Restore, plus a two-step Delete forever. `stacked` lays them out full width for the phone sheet. */
function TrashActions({ task, stacked = false, onDone }: { task: Task; stacked?: boolean; onDone?: () => void }) {
    const restoreTask = useRestoreTask();
    const deleteTask = useDeleteTask();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const size = stacked ? "md" : "sm";
    const wide = stacked ? "flex-1" : "";

    const restore = (
        <Button
            variant={stacked ? "cardPrimary" : "ghost"}
            size={size}
            onClick={() => { restoreTask.mutate(task.id); onDone?.(); }}
            className={stacked ? wide : "text-forest-green hover:text-forest-green"}
            aria-label={`Restore "${task.title}"`}
        >
            <RotateCcw size={14} className="mr-1.5" aria-hidden="true" />
            Restore
        </Button>
    );

    if (confirmDelete) {
        return (
            <div className={`flex items-center gap-2 ${stacked ? "w-full" : ""}`}>
                <Button variant="ghost" size={size} className={wide} onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="danger" size={size} className={wide} onClick={() => { deleteTask.mutate(task.id); onDone?.(); }}>
                    Delete forever
                </Button>
            </div>
        );
    }

    return (
        <div className={`flex shrink-0 items-center gap-2 ${stacked ? "w-full" : ""}`}>
            {restore}
            <Button
                variant="ghost"
                size={size}
                onClick={() => setConfirmDelete(true)}
                className={stacked ? `${wide} text-red-400 hover:text-red-300` : "text-twilight-text-muted hover:text-red-400"}
                aria-label={`Permanently delete "${task.title}"`}
            >
                <Trash2 size={14} className={stacked ? "mr-1.5" : ""} aria-hidden="true" />
                {stacked ? "Delete" : null}
            </Button>
        </div>
    );
}

function TrashTaskRow({ task, onOpen }: { task: Task; onOpen?: () => void }) {
    const date = trashedOn(task);
    const text = (
        <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-sm font-medium text-twilight-text">{task.title}</p>
            {date ? <p className="mt-0.5 text-xs text-twilight-text-muted">{date}</p> : null}
        </div>
    );
    const row = "group flex w-full items-center gap-3 rounded-2xl border border-twilight-border/30 bg-twilight-surface/40 px-4 py-3 text-left transition-colors hover:bg-twilight-surface-hover/40";

    // Phones: the whole row opens the sheet, so the title never has to fight the buttons for room.
    if (onOpen) {
        return (
            <button type="button" onClick={onOpen} className={`${row} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50`}>
                {text}
                <ChevronRight size={16} className="shrink-0 text-twilight-text-soft/90" aria-hidden="true" />
            </button>
        );
    }

    return (
        <div className={row}>
            {text}
            <TrashActions task={task} />
        </div>
    );
}

function EmptyTrashButton({ compact }: { compact: boolean }) {
    const [open, setOpen] = useState(false);
    const emptyTrash = useEmptyTrash();
    const online = useOnlineStatus();

    return (
        <AlertDialog.Root open={open} onOpenChange={setOpen}>
            <AlertDialog.Trigger asChild>
                <Button variant={compact ? "ghost" : "danger"} size="sm" disabled={!online || emptyTrash.isPending} className={compact ? "text-sm text-red-400 hover:text-red-300" : "gap-1.5"}>
                    {compact ? null : <Trash2 size={14} aria-hidden="true" />}
                    Empty Trash
                </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>Empty Trash?</AlertDialog.Title>
                    <AlertDialog.Description>
                        Every task in Trash is deleted for good, with its subtasks and notes. It can&rsquo;t be undone.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button variant="danger" size="md" onClick={() => emptyTrash.mutate()}>Delete all</Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}

export default function TrashView() {
    const shell = useShellMode();
    const { data: tasks, isLoading, isFetching, loadMore } = usePagedTasks("ARCHIVED");
    const [openId, setOpenId] = useState<string | null>(null);
    // Keep the last task while the sheet animates out after a restore or delete.
    const [lastOpen, setLastOpen] = useState<Task | null>(null);
    const current = tasks?.find((task) => task.id === openId) ?? null;
    if (current && current !== lastOpen) setLastOpen(current);
    const sheetTask = current ?? lastOpen;
    const hasTasks = Boolean(tasks && tasks.length > 0);

    return (
        <MainLayout
            requireAuth
            hideContextualOrb
            compactHeaderRightInline
            headerRight={hasTasks ? <EmptyTrashButton compact={shell.isCompact} /> : undefined}
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
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-accent-primary/70" />
                        <p className="text-xs leading-relaxed text-twilight-text-muted">
                            Tasks here can be restored to your active workspace. Permanently deleting a task cannot be undone.
                        </p>
                    </div>

                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : hasTasks ? (
                        <div className="space-y-2">
                            {tasks!.map((task) => (
                                <TrashTaskRow key={task.id} task={task} onOpen={shell.isCompact ? () => setOpenId(task.id) : undefined} />
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
                    {loadMore && (
                        <div className="mt-4 flex justify-center">
                            <Button variant="ghost" size="sm" onClick={loadMore} disabled={isFetching}>
                                {isFetching ? "Loading…" : "Show older"}
                            </Button>
                        </div>
                    )}
                </PageContent>
            </ScrollAreaWrapper>

            {shell.isCompact && sheetTask ? (
                <UtilitySheet
                    title="In Trash"
                    fit
                    subtitle={trashedOn(sheetTask)}
                    open={Boolean(current)}
                    onClose={() => setOpenId(null)}
                    footer={
                        <div className="border-t border-twilight-border px-4 pb-2 pt-3">
                            <TrashActions key={sheetTask.id} task={sheetTask} stacked onDone={() => setOpenId(null)} />
                        </div>
                    }
                >
                    <p className="whitespace-pre-wrap break-words pt-2 font-display text-lg font-semibold leading-snug text-twilight-text">
                        {sheetTask.title}
                    </p>
                </UtilitySheet>
            ) : null}
        </MainLayout>
    );
}
