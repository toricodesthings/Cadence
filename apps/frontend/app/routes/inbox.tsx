import { useMemo, useState } from "react";
import { CalendarDays, Inbox, PanelRightClose, Sparkles } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { PlannerHeader } from "../components/layout/PlannerHeader";
import { PageContent } from "../components/layout/page-layout";
import { AddTaskInput } from "../components/tasks/AddTaskInput";
import { TaskList } from "../components/tasks/TaskList";
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
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useInbox } from "../hooks/inbox";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useShellMode } from "../hooks/use-shell-mode";

export default function InboxView() {
    const shell = useShellMode();
    const [view, setView] = useState<"list" | "kanban">("list");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const { data: inboxItems = [], isLoading: inboxLoading } = useInbox();
    const { data: holdingTasks = [], isLoading: tasksLoading } = useTasks({ state: "ACTIVE", hasNoProject: true });

    useDocumentMeta(
        "Holding · Cadence",
        "Capture unmanaged work, keep it visible, and sort raw notes without losing calm.",
    );

    const sidePanel = (
        <ResizableSidePanel ariaLabel="Resize holding sidebar">
            <AnimatePresence mode="wait">
                {selectedTaskId ? (
                    <TaskEditPanel
                        key={`holding-edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
                        onClose={() => setSelectedTaskId(null)}
                    />
                ) : (
                    <ScrollAreaWrapper key="holding-calendar">
                        <div className="p-5">
                            <CalendarView />
                        </div>
                    </ScrollAreaWrapper>
                )}
            </AnimatePresence>
        </ResizableSidePanel>
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
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-twilight-border px-4 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={selectedTaskId ? "Open task details" : "Open holding calendar"}
        >
            {selectedTaskId ? <PanelRightClose size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
            {selectedTaskId ? "Details" : "Calendar"}
        </button>
    ) : undefined;

    const primaryContent = useMemo(() => {
        if (view === "kanban") {
            return (
                <div className="flex flex-col gap-8">
                    <section>
                        <div className="mb-4 flex items-center gap-3">
                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Unmanaged tasks</h2>
                            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{holdingTasks.length}</span>
                            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                        </div>
                        <KanbanBoard tasks={holdingTasks} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                    </section>
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
                <section>
                    <div className="mb-4 flex items-center gap-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Unmanaged tasks</h2>
                        <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{holdingTasks.length}</span>
                        <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
                    </div>
                    {holdingTasks.length > 0 ? (
                        <TaskList tasks={holdingTasks} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                    ) : (
                        <EmptyState />
                    )}
                </section>

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
            <ScrollAreaWrapper>
                <PageContent width="default">
                    <PlannerHeader />

                    <div className="mt-6">
                        <AddTaskInput projectId={undefined} tasks={holdingTasks} />
                    </div>

                    {tasksLoading || inboxLoading ? <TaskListSkeleton /> : primaryContent}
                </PageContent>
            </ScrollAreaWrapper>

            {!shell.isWide && (
                <ResponsiveOverlayPanel
                    ariaLabel={selectedTaskId ? "Holding details" : "Holding calendar"}
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    title={selectedTaskId ? "Task details" : "Calendar"}
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
                            <ScrollAreaWrapper key="holding-mobile-calendar">
                                <div className="p-5">
                                    <CalendarView />
                                </div>
                            </ScrollAreaWrapper>
                        )}
                    </AnimatePresence>
                </ResponsiveOverlayPanel>
            )}
        </MainLayout>
    );
}
