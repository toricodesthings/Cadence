import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useState, useMemo, useCallback } from "react";
import { CalendarDays, Inbox, PanelRightClose, PanelRightOpen } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { PlannerHeader } from "../components/layout/PlannerHeader";
import { LocationNotice } from "../components/location/LocationNotice";
import { PageContent } from "../components/layout/PageLayout";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { UtilitySheet } from "../components/shared/UtilitySheet";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import { CaptureInput } from "../components/holding/CaptureInput";
import { HoldingFeed } from "../components/holding/HoldingFeed";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { Button } from "../components/primitives/Button";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { HoldingPlannerPanel } from "../components/holding/HoldingPlannerPanel";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useAssistantStore } from "../stores/assistant-store";
import { useInbox } from "../hooks/inbox";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";

export default function HomeRoute() {
    const shell = useShellMode();
    const [captureOpen, setCaptureOpen] = useState(false);
    const [captureDraft, setCaptureDraft] = useState("");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [selectedInboxItemId, setSelectedInboxItemId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
        setMobilePanelOpen(true);
        setSelectedInboxItemId(null);
    });

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


    const clearSelection = useCallback(() => {
        setSelectedTaskId(null);
        setSelectedInboxItemId(null);
    }, []);

    /* ── Side panel — ClarifySheet for captures, EditSidePanel for tasks, Overview fallback ── */
    const sidePanel = (
        <EditSidePanelRail ariaLabel="Resize holding panel" width={holdingPanelWidth} onWidthChange={setHoldingPanelWidth}>
            {hasPanelContent ? (
                selectedInboxItem ? (
                    <EditSidePanel kind="capture" item={selectedInboxItem} onClose={clearSelection}
                        onOpenFullEditor={(taskId) => { setSelectedInboxItemId(null); setSelectedTaskId(taskId); }} />
                ) : selectedTaskId ? (
                    <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
                ) : <HoldingPlannerPanel />
            ) : null}
        </EditSidePanelRail>
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

    // Clarify always opens the sheet (never toggles it shut) so the action is
    // deterministic — clicking "Clarify" reliably surfaces the triage pane.
    const handleClarifyInboxItem = (itemId: string) => {
        setSelectedTaskId(null);
        setSelectedInboxItemId(itemId);
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
    const railOpen = Boolean(railShowsAssistant || hasPanelContent);
    const toggleRail = () => {
        if (railShowsAssistant) toggleAssistantPanel();
        else if (hasPanelContent) {
            clearSelection();
            if (holdingPanelOpen) toggleHoldingPanel();
        } else toggleHoldingPanel();
    };
    const headerRight = shell.isWide ? (
        <Button variant="ghost" size="icon"
            type="button"
            onClick={toggleRail}
            className="btn-icon rounded-2xl"
            aria-label={
                railShowsAssistant
                    ? "Hide Cadence"
                    : railOpen
                        ? "Hide review panel"
                        : "Show review panel"
            }
        >
            {railOpen ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRightOpen size={18} aria-hidden="true" />}
        </Button>
    ) : (
        <Button variant="ghost" size="icon"
            type="button"
            onClick={() => {
                clearSelection();
                setMobilePanelOpen(true);
            }}
            className="btn-icon rounded-2xl"
            aria-label="Open planner"
        >
            <CalendarDays size={16} aria-hidden="true" />
        </Button>
    );

    const feed = tasksLoading || inboxLoading ? (
        <TaskListSkeleton />
    ) : (
        <HoldingFeed
            inboxItems={inboxItems}
            holdingTasks={holdingTasks}
            selectedTaskId={selectedTaskId}
            selectedInboxItemId={selectedInboxItemId}
            onSelectTask={handleSelectTask}
            onSelectInboxItem={handleSelectInboxItem}
            onClarifyInboxItem={handleClarifyInboxItem}
        />
    );

    return (
        <MainLayout
            requireAuth
            hideContextualOrb
            sidePanel={sidePanel}
            sidePanelActive={Boolean(hasPanelContent)}
            sidePanelLabel="Review"
            headerRight={headerRight}
            compactHeaderRightInline
            shellHeader={{
                title: "Capture",
                eyebrow: "Inbox",
                icon: <Inbox size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-capture, var(--accent-primary))",
            }}
        >
            {shell.isCompact ? <PageContent className="flex min-h-0 flex-1 flex-col pb-4">{feed}</PageContent> : <ScrollAreaWrapper>
                <PageContent width="default">
                    {/* Greeting — demoted per M1: capture leads, warmth follows */}
                    <PlannerHeader className="mb-4 lg:mb-5" />
                    <LocationNotice />

                    {/* ── Universal capture composer — the ONE primary action (Law 1) ── */}
                    <div className="mb-8 lg:mb-10"><CaptureInput /></div>

                    {/* ── Unified Holding feed: To clarify → Ready to place ── */}
                    {feed}
                </PageContent>
            </ScrollAreaWrapper>}

            {shell.isCompact && <>
                <ContextualAddOrb directCapture onOpen={() => setCaptureOpen(true)} />
                <UtilitySheet title="What's on your mind?" open={captureOpen} onClose={() => setCaptureOpen(false)}>
                    <CaptureInput mobile draft={captureDraft} onDraftChange={setCaptureDraft} onCaptured={() => setCaptureOpen(false)} />
                </UtilitySheet>
            </>}

            {/* ── Mobile overlay — ClarifySheet / EditSidePanel / Overview (C4 fix) ── */}
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
                    mode={selectedTaskId || selectedInboxItem ? mobileDetailMode : "peek"}
                    fill={Boolean(selectedTaskId || selectedInboxItem)}
                    title={
                        selectedInboxItem ? "Clarify"
                            : selectedTaskId ? "Task details"
                            : "Review"
                    }
                    showHeader={!selectedInboxItem && !selectedTaskId}
                >
                    <>
                        {selectedInboxItem ? (
                            <EditSidePanel kind="capture"
                                key={`clarify-mobile-${selectedInboxItem.id}`}
                                item={selectedInboxItem}
                                detailMode={mobileDetailMode}
                                onDetailModeChange={setMobileDetailMode}
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
                            <EditSidePanel kind="task"
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
                    </>
                </ResponsiveOverlayPanel>
            )}
        </MainLayout>
    );
}
