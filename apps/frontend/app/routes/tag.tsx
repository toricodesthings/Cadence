import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { MoreVertical, Pencil, Tag as TagIcon, Trash2, X } from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import { Composer } from "../components/shared/Composer";
import { UtilitySheet } from "../components/shared/UtilitySheet";
import { Swatches, TAG_SWATCHES } from "../components/shared/Swatches";
import { useTaskComposer } from "../components/tasks/TaskComposer";
import * as DropdownMenu from "../components/primitives/DropdownMenu";
import * as AlertDialog from "../components/primitives/AlertDialog";
import { Button } from "../components/primitives/Button";
import { Tip } from "../components/primitives";
import { useTags } from "../hooks/tags/use-tags";
import { useUpdateTag } from "../hooks/tags/use-update-tag";
import { useDeleteTag } from "../hooks/tags/use-delete-tag";
import { useTasks } from "../hooks/tasks/use-tasks";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { sortTasks } from "../lib/utils/task/sort-tasks";
import { resolveTagColor } from "../lib/utils/color-resolver";
import type { Task } from "@cadence/contracts/task";

/** The orb's direct add: every task made here carries this tag. */
function TagTaskSheet({ open, onClose, tag, tasks }: { open: boolean; onClose: () => void; tag: { id: string; name: string }; tasks: Task[] }) {
    const { reset, ...draft } = useTaskComposer({ open, tasks, lockedTag: tag, onSaved: onClose });
    return <Composer open={open} onClose={() => { reset(); onClose(); }} {...draft} />;
}

/**
 * A tag as a place (phones reach it from the workspace menu, a task's tag chip
 * or a `?tag=` link). Same skeleton as a project, but flat: no sections, no
 * kanban, no manual order — tags label work, they don't organise it.
 */
export default function TagView() {
    const { tagId = "" } = useParams();
    const navigate = useNavigate();
    const shell = useShellMode();
    const { data: tags } = useTags();
    const updateTag = useUpdateTag();
    const deleteTag = useDeleteTag();
    const { data: activeTasks, isLoading } = useTasks({ state: "ACTIVE" });
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [addOpen, setAddOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [name, setName] = useState("");
    const [color, setColor] = useState("default");

    useRouteFocus();
    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
        setMobilePanelOpen(true);
    });

    const tag = tags?.find((t) => t.id === tagId);
    const accent = resolveTagColor(tag?.color, "var(--color-twilight-text-soft)");
    const tasks = useMemo(
        () => sortTasks((activeTasks ?? []).filter((t) => t.tagIds?.includes(tagId)), "smart"),
        [activeTasks, tagId],
    );

    const openEdit = () => {
        setName(tag?.name ?? "");
        setColor(tag?.color ?? "default");
        setEditOpen(true);
    };

    const saveEdit = () => {
        const trimmed = name.trim();
        if (!trimmed || !tag) return;
        updateTag.mutate({ id: tag.id, name: trimmed, color });
        setEditOpen(false);
    };

    const handleDelete = () => {
        deleteTag.mutate(tagId);
        navigate("/");
    };

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => {
            const next = current === taskId ? null : taskId;
            if (next && !shell.isWide) {
                setMobileDetailMode("peek");
                setMobilePanelOpen(true);
            }
            return next;
        });
    };

    if (tags && !tag) {
        return (
            <MainLayout requireAuth pageTitle="Tag not found">
                <PageContent width="default">
                    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
                        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
                            <X size={24} className="text-twilight-text-muted" />
                        </div>
                        <h3 className="mb-2 text-lg font-medium text-twilight-text">Tag not found</h3>
                        <p className="mb-6 max-w-sm text-sm text-twilight-text-muted">This tag may have been deleted or the link is incorrect.</p>
                        <Button variant="cardPrimary" size="md" onClick={() => navigate("/")}>Go to Capture</Button>
                    </div>
                </PageContent>
            </MainLayout>
        );
    }

    return (
        <>
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete the tag "{tag?.name}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            The tag comes off every task that has it. The tasks themselves stay.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button variant="danger" size="md" onClick={handleDelete}>Delete tag</Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>

            <UtilitySheet
                title="Edit tag"
                open={editOpen}
                onClose={() => setEditOpen(false)}
                footer={
                    <div className="border-t border-twilight-border px-4 py-3">
                        <Button type="submit" form="edit-tag" variant="primary" size="md" disabled={!name.trim()} className="min-h-12 w-full">Save</Button>
                    </div>
                }
            >
                <form id="edit-tag" className="space-y-5" onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tag name"
                        aria-label="Tag name"
                        enterKeyHint="done"
                        className="min-h-12 w-full rounded-2xl border border-twilight-border bg-white/[0.04] px-4 text-base text-twilight-text outline-none placeholder:text-twilight-text-muted/80 focus:border-accent-primary/40"
                    />
                    <Swatches options={TAG_SWATCHES} value={color} onChange={setColor} />
                </form>
            </UtilitySheet>

            <MainLayout
                requireAuth
                hideContextualOrb={shell.isCompact}
                sidePanel={
                    <EditSidePanelRail ariaLabel="Resize task panel" minWidth={300} maxWidth={500}>
                        {shell.isWide && selectedTaskId ? (
                            <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
                        ) : null}
                    </EditSidePanelRail>
                }
                sidePanelActive={Boolean(selectedTaskId)}
                onCloseSidePanel={() => setSelectedTaskId(null)}
                sidePanelLabel="Task"
                compactHeaderRightInline
                headerRight={tag ? (
                    <DropdownMenu.Root>
                        <Tip label="Tag options">
                            <DropdownMenu.Trigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Tag options">
                                    <MoreVertical size={18} aria-hidden="true" />
                                </Button>
                            </DropdownMenu.Trigger>
                        </Tip>
                        <DropdownMenu.Content align="end" className="w-52">
                            <DropdownMenu.Item className="flex min-h-11 items-center gap-2" onSelect={openEdit}>
                                <Pencil size={15} aria-hidden="true" /> Rename or recolour
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item variant="danger" className="flex min-h-11 items-center gap-2" onSelect={() => setDeleteOpen(true)}>
                                <Trash2 size={15} aria-hidden="true" /> Delete tag
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Root>
                ) : undefined}
                pageTitle={tag?.name ?? "Tag"}
                pageDescription="Every active task carrying this tag."
                shellHeader={{
                    title: tag?.name ?? "Tag",
                    eyebrow: "Tag",
                    icon: <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }} aria-hidden="true" />,
                    accentColor: accent,
                }}
            >
                <ScrollAreaWrapper>
                    <PageContent width="default">
                        {isLoading ? (
                            <TaskListSkeleton />
                        ) : tasks.length > 0 ? (
                            <TaskList tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} reorderable={false} />
                        ) : (
                            <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
                                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border" style={{ color: accent }}>
                                    <TagIcon size={24} aria-hidden="true" />
                                </div>
                                <h3 className="mb-2 text-lg font-medium text-twilight-text">No active tasks tagged "{tag?.name}"</h3>
                                <p className="max-w-sm text-sm text-twilight-text-muted">Add the tag from any task's editor, or tap + to add a task with it.</p>
                            </div>
                        )}
                    </PageContent>
                </ScrollAreaWrapper>

                {shell.isCompact && tag && <>
                    <ContextualAddOrb directCapture directLabel="Add task" onOpen={() => setAddOpen(true)} />
                    <TagTaskSheet open={addOpen} onClose={() => setAddOpen(false)} tag={tag} tasks={activeTasks ?? []} />
                </>}
            </MainLayout>

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Tag task details"
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    mode={mobileDetailMode}
                >
                    <EditSidePanel kind="task"
                        key={`tag-mobile-edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
                        detailMode={mobileDetailMode}
                        onDetailModeChange={setMobileDetailMode}
                        onClose={() => {
                            setSelectedTaskId(null);
                            setMobilePanelOpen(false);
                        }}
                    />
                </ResponsiveOverlayPanel>
            )}
        </>
    );
}
