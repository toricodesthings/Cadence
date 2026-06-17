import { useState, useMemo, useCallback } from "react";
import { CalendarDays, Inbox, PanelRightClose, PanelRightOpen } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { AnimatePresence, motion } from "framer-motion";
import { MainLayout } from "../components/layout/MainLayout";
import { PlannerHeader } from "../components/layout/PlannerHeader";
import { PageContent } from "../components/layout/PageLayout";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { CaptureInput } from "../components/holding/CaptureInput";
import { HoldingFeed } from "../components/holding/HoldingFeed";
import { ClarifySheet } from "../components/holding/ClarifySheet";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { HoldingPlannerPanel } from "../components/holding/HoldingPlannerPanel";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useAssistantStore } from "../stores/assistant-store";
import { useInbox } from "../hooks/inbox";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";

export default function HomeRoute() {
    const shell = useShellMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedInboxItemId, setSelectedInboxItemId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const { data: inboxItems = [], isLoading: inboxLoading } = useInbox();
    const { data: holdingTasks = [], isLoading: tasksLoading } = useTasks({
        state: "ACTIVE",
        hasNoProject: true,
    });
    const { holdingPanelOpen, holdingPanelWidth, setHoldingPanelWidth, toggleHoldingPanel, railView } = useRightPanelStore();
    const { assistantPanelOpen, toggleAssistantPanel } = useAssistantStore();

    useDocumentMeta(
        "Capture · Cadence",
        "Capture anything. Clarify later. Place when ready.",
    );

    useRouteFocus();

    // Find the selected inbox item for ClarifySheet
    const selectedInboxItem = useMemo(
        () => inboxItems.find((i) => i.id === selectedInboxItemId) ?? null,
        [inboxItems, selectedInboxItemId],
    );

    // Determine which panel content to show
    const hasPanelContent = selectedTaskId || selectedInboxItem || holdingPanelOpen;

    const panelMotion = { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };

    const clearSelection = useCallback(() => {
        setSelectedTaskId(null);
        setSelectedInboxItemId(null);
    }, []);

    /* ── Side panel — ClarifySheet for captures, TaskEditPanel for tasks, Overview fallback ── */
    const sidePanel = (
        <AnimatePresence initial={false}>
            {hasPanelContent && (
                <motion.div
                    key="holding-side-panel"
                    initial={{ width: 0 }}
                    animate={{ width: holdingPanelWidth + 4 }}
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
                            ariaLabel="Resize holding panel"
                            width={holdingPanelWidth}
                            onWidthChange={setHoldingPanelWidth}
                        >
                            <AnimatePresence mode="wait">
                                {selectedInboxItem ? (
                                    <ClarifySheet
                                        key={`clarify-${selectedInboxItem.id}`}
                                        item={selectedInboxItem}
                                        onClose={clearSelection}
                                        onOpenFullEditor={(taskId) => {
                                            setSelectedInboxItemId(null);
                                            setSelectedTaskId(taskId);
                                        }}
                                    />
                                ) : selectedTaskId ? (
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
        setSelectedInboxItemId(null);
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const handleSelectInboxItem = (itemId: string) => {
        setSelectedTaskId(null);
        setSelectedInboxItemId((current) => (current === itemId ? null : itemId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    /* ── Header: panel toggle for desktop; planner shortcut for mobile ──
       The arrow collapses/expands whichever pane the shared rail is currently
       showing — Cadence when it holds the rail, the Review panel otherwise — so
       it stays in sync with the rail's mutual exclusivity. */
    // Mirror MainLayout's `assistantInRail`: Cadence holds the rail when it owns
    // the active tab OR when there's no contextual panel for it to defer to.
    // Without the second clause the closer mis-fires when the assistant snapped
    // back into an empty rail (railView still "context") — toggling the calendar
    // instead of closing Cadence.
    const railShowsAssistant = assistantPanelOpen && (railView === "assistant" || !hasPanelContent);
    const railOpen = railShowsAssistant ? assistantPanelOpen : holdingPanelOpen;
    const toggleRail = railShowsAssistant ? toggleAssistantPanel : toggleHoldingPanel;
    const headerRight = shell.isWide ? (
        <button
            type="button"
            onClick={toggleRail}
            className="btn-icon rounded-2xl border border-twilight-border text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={
                railShowsAssistant
                    ? "Hide Cadence"
                    : holdingPanelOpen
                        ? "Hide review panel"
                        : "Show review panel"
            }
        >
            {railOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
        </button>
    ) : (
        <button
            type="button"
            onClick={() => {
                clearSelection();
                setMobilePanelOpen(true);
            }}
            className="btn-icon rounded-2xl border border-twilight-border text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label="Open planner"
        >
            <CalendarDays size={16} aria-hidden="true" />
        </button>
    );

    return (
        <MainLayout
            requireAuth
            hideContextualOrb
            sidePanel={sidePanel}
            sidePanelActive={Boolean(hasPanelContent)}
            sidePanelLabel="Review"
            headerRight={headerRight}
            phoneHeaderRightInline
            contentWidth="default"
            shellHeader={{
                title: "Capture",
                icon: <Inbox size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-capture, var(--accent-primary))",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="default">
                    {/* Greeting — demoted per M1: capture leads, warmth follows */}
                    <PlannerHeader className="mb-4 lg:mb-5" />

                    {/* ── Universal capture composer — the ONE primary action (Law 1) ── */}
                    <div className="mb-8 lg:mb-10">
                        <CaptureInput />
                    </div>

                    {/* ── Unified Holding feed: To clarify → Ready to place ── */}
                    {tasksLoading || inboxLoading ? (
                        <TaskListSkeleton />
                    ) : (
                        <HoldingFeed
                            inboxItems={inboxItems}
                            holdingTasks={holdingTasks}
                            selectedTaskId={selectedTaskId}
                            selectedInboxItemId={selectedInboxItemId}
                            onSelectTask={handleSelectTask}
                            onSelectInboxItem={handleSelectInboxItem}
                        />
                    )}
                </PageContent>
            </ScrollAreaWrapper>

            {/* ── Mobile overlay — ClarifySheet / TaskEditPanel / Overview (C4 fix) ── */}
            {!shell.isWide && (
                <ResponsiveOverlayPanel
                    ariaLabel={
                        selectedInboxItem ? "Clarify capture"
                            : selectedTaskId ? "Task details"
                            : "Holding context"
                    }
                    open={mobilePanelOpen}
                    onClose={() => {
                        setMobilePanelOpen(false);
                        clearSelection();
                    }}
                    mode={selectedTaskId ? mobileDetailMode : "peek"}
                    title={
                        selectedInboxItem ? "Clarify"
                            : selectedTaskId ? "Task details"
                            : "Review"
                    }
                    showHeader
                >
                    <AnimatePresence mode="wait">
                        {selectedInboxItem ? (
                            <ClarifySheet
                                key={`clarify-mobile-${selectedInboxItem.id}`}
                                item={selectedInboxItem}
                                onClose={() => {
                                    setSelectedInboxItemId(null);
                                    setMobilePanelOpen(false);
                                }}
                                onOpenFullEditor={(taskId) => {
                                    setSelectedInboxItemId(null);
                                    setSelectedTaskId(taskId);
                                    setMobileDetailMode("peek");
                                }}
                            />
                        ) : selectedTaskId ? (
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
