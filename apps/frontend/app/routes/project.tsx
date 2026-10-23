import { TaskRouteControls } from "../components/shared/TaskRouteControls";
import { useTaskIntelligence } from "../hooks/core/use-task-intelligence";
import { useTaskDetailSelection } from "../hooks/ui/use-task-detail-selection";
import { useState, useCallback, useMemo } from "react";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { Pencil, Trash2, Repeat, Check, X, Plus, Columns3, FolderOpen } from "lucide-react";
import { useParams, useNavigate } from "react-router";
import { useProjects } from "../hooks/projects/use-projects";
import { useDeleteProject } from "../hooks/projects/use-delete-project";
import { useTasks } from "../hooks/tasks/use-tasks";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { ActiveFilterBar } from "../components/shared/ActiveFilterBar";
import { useFocusViewStore } from "../stores/focus-view-store";
import { SectionedTaskList } from "../components/tasks/SectionedTaskList";
import { useSections } from "../hooks/sections/use-sections";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { AddTaskInput } from "../components/tasks/AddTaskInput";
import { PhoneTaskDetails, TaskDetailsRail } from "../components/shared/TaskDetailsPanels";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { sortTasks } from "../lib/utils/task/sort-tasks";
import { rankTasksForRoute } from "../lib/utils/ranking-reasons";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { resolveAccentColor } from "../lib/utils/color-resolver";
import { PageContent } from "../components/layout/PageLayout";
import { useRouteViewMode } from "../hooks/ui/use-route-view-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { useSectionNav } from "../hooks/ui/use-section-nav";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useHabitsRange } from "../hooks/habits/use-habits";
import { useResolveHabit } from "../hooks/habits/use-resolve-habit";
import { addDays } from "@cadence/domain/time";
import { dayOfInstant, nlpClock } from "../lib/utils/date-format";
import { useToday } from "../lib/utils/user-zone";
import { EditListDialog } from "../components/shared/EditListDialog";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import { ProjectSectionsSheet, ProjectTaskSheet, UNSECTIONED_ID } from "../components/tasks/ProjectSheets";


/* ── Actionable linked-habit row ── */
function LinkedHabitRow({
    habit,
    targetDate,
    onNavigate,
}: {
    habit: { id: string; title: string; targetTime?: string | null };
    targetDate: string;
    onNavigate: () => void;
}) {
    const resolveHabit = useResolveHabit(habit.id);
    const isResolving = resolveHabit.isPending;

    return (
        <div className="flex items-center gap-3 py-2.5 group">
            <button
                type="button"
                disabled={isResolving}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isResolving) resolveHabit.mutate({ targetDate, status: "COMPLETED" });
                }}
                aria-label={isResolving ? "Completing routine" : `Mark ${habit.title} complete`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-moonlit/30 text-moonlit/70 transition-colors hover:border-moonlit hover:text-moonlit disabled:cursor-wait lg:h-6 lg:w-6"
            >
                {isResolving ? (
                    <span className="h-2 w-2 rounded-full bg-moonlit/70 animate-pulse" />
                ) : (
                    <Check size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
            </button>
            <button
                type="button"
                onClick={onNavigate}
                className="flex-1 truncate text-[14px] font-medium text-twilight-text text-left hover:text-moonlit transition-colors"
            >
                {habit.title}
            </button>
            {habit.targetTime && (
                <span className="text-[12px] text-twilight-text-muted">{habit.targetTime}</span>
            )}
        </div>
    );
}

export default function ProjectView() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { data: projects } = useProjects();
    const deleteProject = useDeleteProject();
    const shell = useShellMode();
    const { view, setView } = useRouteViewMode("project");
    const selection = useTaskDetailSelection();
    const { selectedTaskId, setSelectedTaskId, handleSelectTask } = selection;


    const [renameOpen, setRenameOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [sectionsFocus, setSectionsFocus] = useState<string | null>(null);
    const { data: sections = [] } = useSections(projectId);
    const [activeSectionId, setActiveSectionId] = useState(UNSECTIONED_ID);

    const project = projects?.find(p => p.id === projectId);
    const projectAccent = project ? resolveAccentColor(project.colorAccent) : "var(--accent-primary)";

    const { data: rawTasks, isLoading } = useTasks({ projectId, state: "ACTIVE" });
    const { activeTagId } = useTagFilterStore();
    const { activeDefinition } = useFocusViewStore();
    const { smartSortEnabled, intelligenceEnabled, focusViewsEnabled } = useTaskIntelligence();
    const { sortMode, setSortMode } = useSortMode(`project:${projectId}`);

    useRouteFocus();

    const { onNextSection, onPrevSection } = useSectionNav();
    useKeyboardShortcuts({ onNextSection, onPrevSection });

    const todayISO = useToday();
    const weekAgoISO = addDays(todayISO, -7);
    const { data: allHabits = [] } = useHabitsRange({ start: weekAgoISO, end: todayISO });
    const linkedHabits = useMemo(
        () => allHabits.filter((h) => h.projectId === projectId && !h.archived),
        [allHabits, projectId],
    );
    const dueLinkedHabits = useMemo(
        () => linkedHabits.filter((h) =>
            h.logs?.some((l) => l.status === "PENDING" && l.targetDate <= todayISO),
        ),
        [linkedHabits, todayISO],
    );

    const { tasks, rationaleByTaskId } = useMemo(() => {
        let filtered = activeTagId
            ? (rawTasks ?? []).filter(t => t.tagIds.includes(activeTagId))
            : (rawTasks ?? []);
        if (activeDefinition && intelligenceEnabled && focusViewsEnabled) {
            filtered = applyFocusView(filtered, activeDefinition, { clock: nlpClock(), dayOf: dayOfInstant });
        }
        if (intelligenceEnabled && smartSortEnabled && sortMode === "smart") return rankTasksForRoute(filtered, "project");
        return { tasks: sortTasks(filtered, sortMode), rationaleByTaskId: {} as Record<string, string | null> };
    }, [rawTasks, activeTagId, sortMode, activeDefinition, intelligenceEnabled, focusViewsEnabled, smartSortEnabled, projectId, todayISO]);

    const handleRenameOpen = () => setRenameOpen(true);

    const handleDelete = () => {
        if (!projectId) return;
        deleteProject.mutate({ id: projectId, name: project?.name ?? "list" });
        navigate("/");
    };

    const focusAddTask = useCallback(() => {
        const input = document.querySelector<HTMLInputElement>('[data-add-task-input]');
        if (input) {
            input.scrollIntoView({ behavior: "smooth", block: "center" });
            requestAnimationFrame(() => input.focus());
        }
    }, []);

    const triggerAddSection = useCallback(() => {
        const btn = document.querySelector<HTMLButtonElement>('[data-add-section-trigger]');
        if (btn) {
            btn.scrollIntoView({ behavior: "smooth", block: "center" });
            requestAnimationFrame(() => btn.click());
        }
    }, []);

    const sidePanel = (
        <TaskDetailsRail selection={selection} ariaLabel="Resize task panel" minWidth={300} maxWidth={500} />
    );

    /* ── Project not-found state ── */
    if (projects && !project) {
        return (
            <MainLayout requireAuth pageTitle="List not found">
                <PageContent width="default">
                    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                        <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                            <X size={24} className="text-twilight-text-muted" />
                        </div>
                        <h3 className="text-lg font-medium text-twilight-text mb-2">List not found</h3>
                        <p className="text-twilight-text-muted text-sm max-w-sm mb-6">
                            This list may have been deleted or the link is incorrect.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate("/")}
                            className="px-5 py-2.5 rounded-2xl text-sm font-medium bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors"
                        >
                            Go to Capture
                        </button>
                    </div>
                </PageContent>
            </MainLayout>
        );
    }

    return (
        <>
            {project && <EditListDialog open={renameOpen} onOpenChange={setRenameOpen} list={{ id: project.id, name: project.name, colorAccent: project.colorAccent ?? "luminous-amber", emoji: project.emoji }} />}

            <MainLayout
                requireAuth
                hideContextualOrb={shell.isCompact}
                sidePanel={sidePanel}
                sidePanelActive={Boolean(selectedTaskId)}
                onCloseSidePanel={() => setSelectedTaskId(null)}
                sidePanelLabel="Task"
                compactHeaderRightInline
                headerRight={project ? (
                    <TaskRouteControls
                        routeKey={`project:${projectId ?? "unknown"}`}
                        title={project.name}
                        view={view}
                        onViewChange={setView}
                        sortMode={sortMode}
                        onSortModeChange={setSortMode}
                        actionsLabel="List"
                        actions={[
                            { label: "New task", icon: Plus, onSelect: focusAddTask, compact: { onSelect: () => setAddOpen(true) } },
                            { label: "Add section", icon: Columns3, onSelect: triggerAddSection, compact: { label: "Sections", onSelect: () => setSectionsFocus("") } },
                            { label: "Rename / Edit list", icon: Pencil, onSelect: handleRenameOpen, compact: { label: "Rename / edit list" } },
                            { label: "Delete list", icon: Trash2, onSelect: handleDelete, danger: true },
                        ]}
                    />
                ) : undefined}
                pageTitle={project?.name ?? "List"}
                shellHeader={{
                    title: project?.name ?? "List",
                    eyebrow: "List",
                    icon: project?.emoji ? (
                        <span className="text-xl leading-none">{project.emoji}</span>
                    ) : (
                        <FolderOpen size={18} aria-hidden="true" />
                    ),
                    accentColor: projectAccent,
                }}
            >
                <PageContent width="default" className="empty:hidden">
                    <ActiveFilterBar placement="body" />
                </PageContent>
                {view === "kanban" ? (
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                        {isLoading ? (
                            <PageContent width="default"><TaskListSkeleton /></PageContent>
                        ) : (
                            <KanbanBoard
                                tasks={tasks ?? []}
                                projectId={projectId}
                                selectedTaskId={selectedTaskId}
                                onSelectTask={handleSelectTask}
                                activeSectionId={activeSectionId}
                                onActiveSectionChange={setActiveSectionId}
                                onManageSections={() => setSectionsFocus("")}
                            />
                        )}
                    </div>
                ) : (
                    <ScrollAreaWrapper>
                        <PageContent width="default">
                            {projectId && !shell.isCompact && (
                                <div className="mb-4">
                                    <AddTaskInput projectId={projectId} tasks={tasks ?? []} />
                                </div>
                            )}

                            {isLoading ? (
                                <TaskListSkeleton />
                            ) : (tasks?.length || sections.length) ? (
                                <SectionedTaskList
                                    tasks={tasks ?? []}
                                    projectId={projectId}
                                    selectedTaskId={selectedTaskId}
                                    onSelectTask={handleSelectTask}
                                    rationaleByTaskId={rationaleByTaskId}
                                    onManageSections={setSectionsFocus}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                                    <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                                        <FolderOpen size={24} className="text-twilight-text-muted" />
                                    </div>
                                    <h3 className="text-lg font-medium text-twilight-text mb-2">No tasks in this list</h3>
                                    <p className="text-twilight-text-muted text-sm max-w-sm">
                                        Add some tasks to get started with {project?.name || "this list"}.
                                    </p>
                                </div>
                            )}

                            {dueLinkedHabits.length > 0 && (
                                <div className="mt-8 rounded-[28px] border border-moonlit/20 bg-moonlit/[0.04] px-5 py-5">
                                    <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-moonlit/90">
                                        <Repeat size={11} aria-hidden="true" />
                                        <span>Routines linked to this list</span>
                                    </div>
                                    <div className="flex flex-col divide-y divide-moonlit/10">
                                        {dueLinkedHabits.map((habit) => {
                                            const pendingLog = habit.logs?.find(
                                                (l) => l.status === "PENDING" && l.targetDate <= todayISO,
                                            );
                                            return (
                                                <LinkedHabitRow
                                                    key={habit.id}
                                                    habit={habit}
                                                    targetDate={pendingLog?.targetDate ?? todayISO}
                                                    onNavigate={() => navigate("/routines")}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </PageContent>
                    </ScrollAreaWrapper>
                )}

                {shell.isCompact && projectId && project && <>
                    <ContextualAddOrb directCapture directLabel="Add task" onOpen={() => setAddOpen(true)} />
                    <ProjectTaskSheet
                        open={addOpen}
                        onClose={() => setAddOpen(false)}
                        projectId={projectId}
                        projectName={project.name}
                        tasks={rawTasks ?? []}
                        sectionId={activeSectionId}
                        onSectionChange={setActiveSectionId}
                    />
                    <ProjectSectionsSheet
                        open={sectionsFocus !== null}
                        onClose={() => setSectionsFocus(null)}
                        focus={sectionsFocus}
                        projectId={projectId}
                        tasks={rawTasks ?? []}
                    />
                </>}
            </MainLayout>

            <PhoneTaskDetails selection={selection} ariaLabel="List task details" />
        </>
    );
}
