import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarDays, Inbox, PanelRightClose, PanelRightOpen } from "lucide-react";
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
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { CalendarView } from "../components/calendar/CalendarView";
import { HoldingPlannerPanel } from "../components/holding/HoldingPlannerPanel";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useInbox } from "../hooks/inbox";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { formatShortDate } from "../lib/utils/date-format";

export default function HomeRoute() {
    const shell = useShellMode();
    const [searchParams] = useSearchParams();
    const [view, setView] = useState<"list" | "kanban">("list");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const selectedHoldingDate = searchParams.get("date");
    const { data: inboxItems = [], isLoading: inboxLoading } = useInbox();
    const { data: holdingTasks = [], isLoading: tasksLoading } = useTasks({
        state: "ACTIVE",
        hasNoProject: true,
        scheduledDate: selectedHoldingDate ?? undefined,
    });
    const { holdingPanelOpen, holdingPanelWidth, setHoldingPanelWidth, toggleHoldingPanel } = useRightPanelStore();

    useDocumentMeta(
        "Holding · Cadence",
        "Capture unmanaged work, keep it visible, and sort raw notes without losing calm.",
    );

    useRouteFocus();

    const panelMotion = { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };
    const holdingSectionLabel = selectedHoldingDate ? `On ${formatShortDate(selectedHoldingDate)}` : "Unmanaged tasks";
    const emptyHoldingLabel = selectedHoldingDate ? `Nothing in Holding on ${formatShortDate(selectedHoldingDate)}.` : "Holding is clear.";
    const visibleHoldingTasks = useMemo(() => holdingTasks, [holdingTasks]);
    const holdingSidePanelWidth = holdingPanelWidth + 4;

    const sidePanel = (
        <AnimatePresence initial={false}>
            {(holdingPanelOpen || selectedTaskId) && (
                <motion.div
                    key="holding-side-panel"
                    initial={{ width: 0 }}
                    animate={{ width: holdingSidePanelWidth }}
                    exit={{ width: 0 }}
                    transition={panelMotion}
                    style={{ willChange: "width", overflow: "hidden" }}
                    className="flex h-full self-stretch shrink-0 items-stretch"
                >
                    <motion.div
                        initial={{ x: 24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 24, opacity: 0 }}
                        transition={panelMotion}
                        style={{ willChange: "transform, opacity" }}
                        className="flex h-full min-w-0 flex-1 items-stretch"
                    >
                        <ResizableSidePanel
                            ariaLabel="Resize holding planner panel"
                            width={holdingPanelWidth}
                            onWidthChange={setHoldingPanelWidth}
                        >
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
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const headerCenter = <ViewToggle view={view} onViewChange={setView} />;
    const headerRight = shell.isPhone ? (
        <ControlsSheet
            routeKey="holding"
            title="Holding controls"
            sections={[
                {
                    id: "view",
                    label: "View",
                    content: (
                        <div className="space-y-3">
                            <p className="text-sm text-twilight-text-soft">Switch between list and board without adding more top chrome.</p>
                            <ViewToggle view={view} onViewChange={setView} compact />
                        </div>
                    ),
                },
                {
                    id: "panel",
                    label: "Panel",
                    content: (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => setMobilePanelOpen(true)}
                                className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft"
                            >
                                {selectedTaskId ? <PanelRightClose size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
                                {selectedTaskId ? "Open task details" : "Open processing context"}
                            </button>
                            <p className="text-sm text-twilight-text-muted">Use the side context to process captures without leaving Holding.</p>
                        </div>
                    ),
                },
            ]}
        />
    ) : !shell.isWide ? (
        <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="btn-icon rounded-2xl border border-twilight-border text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={selectedTaskId ? "Open task details" : "Open processing context"}
        >
            {selectedTaskId ? <PanelRightClose size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
        </button>
    ) : (
        <button
            type="button"
            onClick={toggleHoldingPanel}
            className="btn-icon rounded-2xl border border-twilight-border text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={holdingPanelOpen ? "Hide processing context" : "Show processing context"}
        >
            {holdingPanelOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
        </button>
    );

    const primaryContent = useMemo(() => {
        if (view === "kanban") {
            return (
                <div className="flex flex-col gap-8 flex-1 min-h-0">
                    {visibleHoldingTasks.length > 0 ? (
                        <section className="flex-1 min-h-0">
                            <div className="mb-4 flex items-center gap-3 px-4 sm:px-6 lg:px-8">
                                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">{holdingSectionLabel}</h2>
                                <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{visibleHoldingTasks.length}</span>
                                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                            </div>
                            <KanbanBoard tasks={visibleHoldingTasks} projectId={null} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                        </section>
                    ) : selectedHoldingDate ? (
                        <section className="px-4 sm:px-6 lg:px-8">
                            <div className="rounded-[1.75rem] border border-twilight-border/45 bg-twilight-surface/22 px-6 py-8 text-center">
                                <p className="text-base text-twilight-text-soft">{emptyHoldingLabel}</p>
                            </div>
                        </section>
                    ) : null}
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
                {visibleHoldingTasks.length > 0 ? (
                    <section>
                        <div className="mb-4 flex items-center gap-3">
                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">{holdingSectionLabel}</h2>
                            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{visibleHoldingTasks.length}</span>
                            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                        </div>
                        <SectionedTaskList
                            tasks={visibleHoldingTasks}
                            projectId={null}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={handleSelectTask}
                        />
                    </section>
                ) : selectedHoldingDate ? (
                    <section>
                        <div className="rounded-[1.75rem] border border-twilight-border/45 bg-twilight-surface/22 px-6 py-8 text-center">
                            <p className="text-base text-twilight-text-soft">{emptyHoldingLabel}</p>
                        </div>
                    </section>
                ) : null}

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
    }, [emptyHoldingLabel, handleSelectTask, holdingSectionLabel, holdingTasks, inboxItems, selectedHoldingDate, selectedTaskId, view]);

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
                icon: <Inbox size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-inbox)",
            }}
        >
            {view === "kanban" ? (
                <>
                    <PageContent width="default" className="shrink-0">
                        <PlannerHeader />
                        <div className="mt-4 mb-4 rounded-[24px] bg-twilight-surface/30 backdrop-blur-md p-1">
                            <AddTaskInput projectId={undefined} tasks={holdingTasks} />
                        </div>
                    </PageContent>
                    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
                        {tasksLoading || inboxLoading ? (
                            <PageContent width="default"><TaskListSkeleton /></PageContent>
                        ) : primaryContent}
                    </div>
                </>
            ) : (
                <ScrollAreaWrapper>
                    <PageContent width="default">
                        <PlannerHeader />

                        <div className="mt-4 mb-4 rounded-[24px] bg-twilight-surface/30 backdrop-blur-md p-1">
                            <AddTaskInput projectId={undefined} tasks={holdingTasks} />
                        </div>

                        {tasksLoading || inboxLoading ? <TaskListSkeleton /> : primaryContent}
                    </PageContent>
                </ScrollAreaWrapper>
            )}

            {!shell.isWide && (
                <ResponsiveOverlayPanel
                    ariaLabel={selectedTaskId ? "Holding details" : "Holding context"}
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    mode={selectedTaskId ? mobileDetailMode : "peek"}
                >
                    <AnimatePresence mode="wait">
                        {selectedTaskId ? (
                            <TaskEditPanel
                                key={`holding-mobile-edit-${selectedTaskId}`}
                                taskId={selectedTaskId}
                                detailMode={mobileDetailMode}
                                onDetailModeChange={setMobileDetailMode}
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
