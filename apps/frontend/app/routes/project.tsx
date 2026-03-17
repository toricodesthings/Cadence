import { useState, useRef, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { FolderKanban, Pencil, Trash2 } from "lucide-react";
import { useParams, useNavigate } from "react-router";
import { useProjects } from "../hooks/projects";
import { useUpdateProject, useDeleteProject } from "../hooks/projects";
import { useTasks } from "../hooks/tasks";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { SectionedTaskList } from "../components/tasks/SectionedTaskList";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { AddTaskInput } from "../components/tasks/AddTaskInput";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { sortTasks } from "../lib/utils/sort-tasks";
import * as Dialog from "../components/primitives/Dialog";
import * as AlertDialog from "../components/primitives/AlertDialog";
import { Button } from "../components/primitives/Button";
import { resolveAccentColor } from "../lib/utils/color-resolver";
import { EmojiPickerPopover } from "../components/shared/EmojiPickerPopover";
import { PageContent } from "../components/layout/PageLayout";
import { useViewMode } from "../hooks/ui/use-view-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { PROJECT_ACCENT_OPTIONS, PROJECT_FALLBACK_COLOR } from "../lib/constants/colors";

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 500;
const DEFAULT_PANEL_WIDTH = 320;

export default function ProjectView() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { data: projects } = useProjects();
    const updateProject = useUpdateProject();
    const deleteProject = useDeleteProject();
    const shell = useShellMode();
    const { view, setView } = useViewMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [colorValue, setColorValue] = useState("luminous-amber");
    const [emojiValue, setEmojiValue] = useState("");
    const [isCustomColor, setIsCustomColor] = useState(false);
    const isDragging = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const project = projects?.find(p => p.id === projectId);
    const projectAccent = project ? resolveAccentColor(project.colorAccent) : "var(--color-lantern)";

    const { data: rawTasks, isLoading } = useTasks({ projectId, state: "ACTIVE" });
    const { activeTagId } = useTagFilterStore();
    const { sortMode, setSortMode } = useSortMode();

    useRouteFocus();

    const tasks = sortTasks(
        activeTagId
            ? (rawTasks ?? []).filter(t => (t as any).tagIds?.includes(activeTagId))
            : (rawTasks ?? []),
        sortMode
    );

    const handleRenameOpen = () => {
        setRenameValue(project?.name ?? "");
        setColorValue(project?.colorAccent ?? "luminous-amber");
        setEmojiValue(project?.emoji ?? "");
        setIsCustomColor(project?.colorAccent?.startsWith("#") ?? false);
        setRenameOpen(true);
    };

    const handleRenameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = renameValue.trim();
        if (!trimmed || !projectId) return;

        updateProject.mutate({
            id: projectId,
            name: trimmed,
            colorAccent: colorValue,
            emoji: emojiValue || null,
        });
        setRenameOpen(false);
    };

    const handleDelete = () => {
        if (!projectId) return;
        deleteProject.mutate(projectId);
        navigate("/");
    };

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        startX.current = e.clientX;
        startWidth.current = panelWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, [panelWidth]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = startX.current - e.clientX;
            const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth.current + delta));
            setPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

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

    const sidePanel = shell.isWide && selectedTaskId ? (
        <>
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                className="w-1 shrink-0 cursor-col-resize hover:bg-lantern/20 active:bg-lantern/30 transition-colors relative z-10 group"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize task panel"
                aria-valuenow={panelWidth}
                aria-valuemin={MIN_PANEL_WIDTH}
                aria-valuemax={MAX_PANEL_WIDTH}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        setPanelWidth((w) => Math.min(MAX_PANEL_WIDTH, w + 20));
                    } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        setPanelWidth((w) => Math.max(MIN_PANEL_WIDTH, w - 20));
                    }
                }}
            >
                <div className="absolute inset-y-0 -left-0.5 w-1.5 rounded-full opacity-0 group-hover:opacity-100 bg-lantern/25 transition-opacity" />
            </div>

            {/* Task edit panel — spans full height */}
            <div
                className="shrink-0 border-l border-twilight-border overflow-hidden"
                style={{ width: panelWidth }}
            >
                <AnimatePresence mode="wait">
                    <TaskEditPanel
                        key={`edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
                        onClose={() => setSelectedTaskId(null)}
                    />
                </AnimatePresence>
            </div>
        </>
    ) : undefined;

    return (
        <>
            {/* Rename dialog */}
            <Dialog.Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <Dialog.DialogContent className="max-w-sm" hideCloseButton>
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Rename project</Dialog.DialogTitle>
                        <Dialog.DialogDescription>
                            Enter a new name for <span className="text-twilight-text">{project?.name}</span>.
                        </Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <form onSubmit={handleRenameSubmit} className="flex flex-col gap-4">
                        <div className="flex gap-2 mb-3">
                            <EmojiPickerPopover emoji={emojiValue} onSelect={setEmojiValue} />
                            <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                placeholder="Project name"
                                className="flex-1 w-full rounded-xl bg-white/[0.06] border border-twilight-border px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/80 outline-none focus:border-lantern/40 transition-colors"
                                onKeyDown={(e) => e.key === "Escape" && setRenameOpen(false)}
                            />
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                            {PROJECT_ACCENT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        setColorValue(opt.value);
                                        setIsCustomColor(false);
                                    }}
                                    title={opt.label}
                                    className={`w-5 h-5 rounded-full transition-[transform,opacity] duration-150 cursor-pointer ${colorValue === opt.value && !isCustomColor
                                        ? "ring-2 ring-offset-2 ring-offset-twilight-surface scale-110"
                                        : "opacity-60 hover:opacity-100"
                                        }`}
                                    style={{ backgroundColor: opt.varName }}
                                />
                            ))}
                            <div
                                className="relative flex items-center justify-center w-[22px] h-[22px] rounded-full overflow-hidden cursor-pointer ring-1 ring-white/10 hover:ring-white/20 transition-all"
                                title="Custom Hex Color"
                                style={{ backgroundColor: colorValue.startsWith("#") ? colorValue : "transparent" }}
                            >
                                <div className="absolute inset-0 bg-twilight-surface/30 backdrop-blur-sm pointer-events-none" />
                                <input
                                    type="color"
                                    value={colorValue.startsWith("#") ? colorValue : PROJECT_FALLBACK_COLOR}
                                    onChange={(e) => {
                                        setColorValue(e.target.value);
                                        setIsCustomColor(true);
                                    }}
                                    className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer opacity-0"
                                />
                                {isCustomColor && (
                                    <div className="absolute inset-0 ring-2 ring-twilight-surface/50 rounded-full pointer-events-none" />
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setRenameOpen(false)}
                                className="px-4 py-2 rounded-xl text-sm text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!renameValue.trim()}
                                className="px-4 py-2 rounded-xl text-sm bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            >
                                Save changes
                            </button>
                        </div>
                    </form>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            {/* Delete confirmation */}
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{project?.name}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This will permanently delete the project and all its tasks. This action cannot be undone.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={handleDelete}
                            >
                                Delete project
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>

            <MainLayout
                requireAuth
                sidePanel={sidePanel}
                headerCenter={<ViewToggle view={view} onViewChange={setView} />}
                headerRight={project ? (shell.isPhone ? (
                    <ControlsSheet
                        routeKey={`project:${projectId ?? "unknown"}`}
                        title={project.name}
                        sections={[
                            {
                                id: "view",
                                label: "View",
                                content: (
                                    <div className="space-y-3">
                                        <ViewToggle view={view} onViewChange={setView} compact />
                                    </div>
                                ),
                            },
                            {
                                id: "sort",
                                label: "Sort",
                                content: (
                                    <div className="space-y-2">
                                        {[
                                            { value: "smart", label: "Smart" },
                                            { value: "priority", label: "Priority" },
                                            { value: "manual", label: "Manual" },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setSortMode(option.value as typeof sortMode)}
                                                className={`touch-target flex min-h-11 w-full items-center justify-between rounded-2xl border px-4 text-sm font-medium ${
                                                    sortMode === option.value
                                                        ? "border-lantern/30 bg-lantern/14 text-lantern"
                                                        : "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                ),
                            },
                            {
                                id: "project",
                                label: "Project",
                                content: (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={handleRenameOpen}
                                            className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft"
                                        >
                                            <Pencil size={15} aria-hidden="true" />
                                            Rename / edit project
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteOpen(true)}
                                            className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-400"
                                        >
                                            <Trash2 size={15} aria-hidden="true" />
                                            Delete project
                                        </button>
                                    </div>
                                ),
                            },
                        ]}
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        <SortMenu
                            mode={sortMode}
                            onModeChange={setSortMode}
                            actions={[
                                {
                                    label: "Rename / Edit project",
                                    icon: Pencil,
                                    onSelect: handleRenameOpen,
                                },
                                {
                                    label: "Delete project",
                                    icon: Trash2,
                                    onSelect: () => setDeleteOpen(true),
                                    danger: true,
                                },
                            ]}
                        />
                    </div>
                )
                ) : undefined}
                contentWidth="default"
                pageTitle={project?.name ?? "Project"}
                pageDescription="Work through a focused project view without leaving the Cadence shell."
                shellHeader={{
                    title: project?.name ?? "Project",
                    eyebrow: "Project",
                    icon: project?.emoji ? (
                        <span className="text-xl leading-none">{project.emoji}</span>
                    ) : (
                        <FolderKanban size={18} aria-hidden="true" />
                    ),
                    accentColor: projectAccent,
                }}
            >
                {view === "kanban" ? (
                    <div className="flex-1 min-h-0 min-w-0">
                        {isLoading ? (
                            <PageContent width="default"><TaskListSkeleton /></PageContent>
                        ) : tasks && tasks.length > 0 ? (
                            <KanbanBoard
                                tasks={tasks}
                                projectId={projectId}
                                selectedTaskId={selectedTaskId}
                                onSelectTask={handleSelectTask}
                            />
                        ) : (
                            <PageContent width="default">
                                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                                    <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                                        <FolderKanban size={24} className="text-twilight-text-muted" />
                                    </div>
                                    <h3 className="text-lg font-medium text-twilight-text mb-2">No tasks in this project</h3>
                                    <p className="text-twilight-text-muted text-sm max-w-sm">
                                        Add some tasks to get started with {project?.name || "this project"}.
                                    </p>
                                </div>
                            </PageContent>
                        )}
                    </div>
                ) : (
                    <ScrollAreaWrapper>
                        <PageContent width="default">
                            {projectId && (
                                <div className="mb-4">
                                    <AddTaskInput projectId={projectId} tasks={tasks ?? []} />
                                </div>
                            )}

                            {isLoading ? (
                                <TaskListSkeleton />
                            ) : tasks && tasks.length > 0 ? (
                                <SectionedTaskList
                                    tasks={tasks}
                                    projectId={projectId}
                                    selectedTaskId={selectedTaskId}
                                    onSelectTask={handleSelectTask}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                                    <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                                        <FolderKanban size={24} className="text-twilight-text-muted" />
                                    </div>
                                    <h3 className="text-lg font-medium text-twilight-text mb-2">No tasks in this project</h3>
                                    <p className="text-twilight-text-muted text-sm max-w-sm">
                                        Add some tasks to get started with {project?.name || "this project"}.
                                    </p>
                                </div>
                            )}
                        </PageContent>
                    </ScrollAreaWrapper>
                )}
            </MainLayout>

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Project task details"
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    mode={mobileDetailMode}
                >
                    <TaskEditPanel
                        key={`project-mobile-edit-${selectedTaskId}`}
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
