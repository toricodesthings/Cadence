import { useMemo, useState } from "react";
import { CalendarDays, Inbox, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { AnimatePresence, motion } from "framer-motion";
import { MainLayout } from "../components/layout/MainLayout";
import { PlannerHeader } from "../components/layout/PlannerHeader";
import { PageContent } from "../components/layout/PageLayout";
import { AddTaskInput } from "../components/tasks/AddTaskInput";
import { SectionedTaskList } from "../components/tasks/SectionedTaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { InboxList } from "../components/inbox/InboxList";
import { InboxBoard } from "../components/inbox/InboxBoard";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { ViewToggle } from "../components/shared/ViewToggle";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { CalendarView } from "../components/calendar/CalendarView";
import { HoldingPlannerPanel } from "../components/holding/HoldingPlannerPanel";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useInbox } from "../hooks/inbox";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";

export default function HomeRoute() {
    const shell = useShellMode();
    const [view, setView] = useState<"list" | "kanban">("list");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const { data: inboxItems = [], isLoading: inboxLoading } = useInbox();
    const { data: holdingTasks = [], isLoading: tasksLoading } = useTasks({ state: "ACTIVE", hasNoProject: true });
    const { holdingPanelOpen, toggleHoldingPanel } = useRightPanelStore();

    useDocumentMeta(
        "Holding · Cadence",
        "Capture unmanaged work, keep it visible, and sort raw notes without losing calm.",
    );

    useRouteFocus();

    const panelMotion = { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };

    const sidePanel = (
        <AnimatePresence initial={false}>
            {(holdingPanelOpen || selectedTaskId) && (
                <motion.div
                    key="holding-side-panel"
                    initial={{ width: 0 }}
                    animate={{ width: "auto" }}
                    exit={{ width: 0 }}
                    transition={panelMotion}
                    style={{ overflow: "hidden", willChange: "width" }}
                    className="shrink-0"
                >
                    <motion.div
                        initial={{ x: 32, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 24, opacity: 0 }}
                        transition={panelMotion}
                        style={{ willChange: "transform, opacity" }}
                    >
                        <ResizableSidePanel ariaLabel="Resize holding planner panel">
                            <AnimatePresence mode="wait">
                                {selectedTaskId ? (
                                    <TaskEditPanel
                                        key={`holding-edit-${selectedTaskId}`}
                                        taskId={selectedTaskId}
                                        onClose={() => setSelectedTaskId(null)}
                                    />
                                ) : (
                                    <HoldingPlannerPanel key="holding-planner" />
                                )}
                            </AnimatePresence>
                        </ResizableSidePanel>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobilePanelOpen(true);
        }
    };

    const headerCenter = <ViewToggle view={view} onViewChange={setView} />;
    const headerRight = !shell.isWide ? (
        <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="btn-icon rounded-2xl border border-twilight-border text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={selectedTaskId ? "Open task details" : "Open planner"}
        >
            {selectedTaskId ? <PanelRightClose size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
        </button>
    ) : (
        <button
            type="button"
            onClick={toggleHoldingPanel}
            className="btn-icon rounded-2xl border border-twilight-border text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={holdingPanelOpen ? "Hide planner panel" : "Show planner panel"}
        >
            {holdingPanelOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
        </button>
    );

    const primaryContent = useMemo(() => {
        if (view === "kanban") {
            return (
                <div className="flex flex-col gap-8 flex-1 min-h-0">
                    {holdingTasks.length > 0 && (
                        <section className="flex-1 min-h-0">
                            <div className="mb-4 flex items-center gap-3 px-4 sm:px-6 lg:px-8">
                                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Unmanaged tasks</h2>
                                <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{holdingTasks.length}</span>
                                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                            </div>
                            <KanbanBoard tasks={holdingTasks} projectId={null} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                        </section>
                    )}
                    <section>
                        <div className="mb-4 flex items-center gap-3">
                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Needs processing</h2>
                            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{inboxItems.length}</span>
                            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                        </div>
                        <div className="-mx-4 sm:-mx-6">
                            <InboxBoard items={inboxItems} />
                        </div>
                    </section>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-8">
                {holdingTasks.length > 0 && (
                    <section>
                        <div className="mb-4 flex items-center gap-3">
                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Unmanaged tasks</h2>
                            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{holdingTasks.length}</span>
                            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                        </div>
                        <SectionedTaskList
                            tasks={holdingTasks}
                            projectId={null}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={handleSelectTask}
                        />
                    </section>
                )}

                <section>
                    <div className="mb-4 flex items-center gap-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Needs processing</h2>
                        <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{inboxItems.length}</span>
                        <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                    </div>
                    {inboxItems.length > 0 ? (
                        <InboxList items={inboxItems} />
                    ) : (
                        <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-twilight-border/60 bg-twilight-surface/25 px-6 py-12 text-center">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
                                <Inbox size={20} className="text-twilight-text-muted" />
                            </div>
                            <h3 className="text-lg font-medium text-twilight-text">No raw captures waiting.</h3>
                            <p className="mt-2 max-w-sm text-sm text-twilight-text-muted">
                                Anything you capture outside the task list will gather here until you process it.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        );
    }, [holdingTasks, inboxItems, selectedTaskId, view]);

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            headerCenter={headerCenter}
            headerRight={headerRight}
            contentWidth="default"
            shellHeader={{
                title: "Holding",
                eyebrow: "Capture",
                icon: <Sparkles size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-inbox)",
            }}
        >
            {view === "kanban" ? (
                <>
                    <PageContent width="default" className="shrink-0">
                        <PlannerHeader />

                        <div className="mt-6 mb-6 rounded-[24px] bg-twilight-surface/30 backdrop-blur-md p-1">
                            <AddTaskInput projectId={undefined} tasks={holdingTasks} />
                        </div>
                    </PageContent>
                    <div className="flex-1 min-h-0 min-w-0">
                        {tasksLoading || inboxLoading ? (
                            <PageContent width="default"><TaskListSkeleton /></PageContent>
                        ) : primaryContent}
                    </div>
                </>
            ) : (
                <ScrollAreaWrapper>
                    <PageContent width="default">
                        <PlannerHeader />

                        <div className="mt-6 mb-10 rounded-[24px] bg-twilight-surface/30 backdrop-blur-md p-1">
                            <AddTaskInput projectId={undefined} tasks={holdingTasks} />
                        </div>

                        {tasksLoading || inboxLoading ? <TaskListSkeleton /> : primaryContent}
                    </PageContent>
                </ScrollAreaWrapper>
            )}

            {!shell.isWide && (
                <ResponsiveOverlayPanel
                    ariaLabel={selectedTaskId ? "Holding details" : "Holding planner"}
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    title={selectedTaskId ? "Task details" : "Planner"}
                >
                    <AnimatePresence mode="wait">
                        {selectedTaskId ? (
                            <TaskEditPanel
                                key={`holding-mobile-edit-${selectedTaskId}`}
                                taskId={selectedTaskId}
                                onClose={() => {
                                    setSelectedTaskId(null);
                                    setMobilePanelOpen(false);
                                }}
                            />
                        ) : (
                            <HoldingPlannerPanel key="holding-mobile-planner" />
                        )}
                    </AnimatePresence>
                </ResponsiveOverlayPanel>
            )}
        </MainLayout>
    );
}
