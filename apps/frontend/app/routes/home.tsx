import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useState, useMemo, useCallback, useRef } from "react";
import { CalendarDays, Inbox, PanelRightClose, PanelRightOpen } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { LocationNotice } from "../components/location/LocationNotice";
import { PageContent } from "../components/layout/PageLayout";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { Composer } from "../components/shared/Composer";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import { CaptureInput, useCaptureComposer } from "../components/holding/CaptureInput";
import { HoldingFeed } from "../components/holding/HoldingFeed";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { Button } from "../components/primitives/Button";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { HoldingPlannerPanel } from "../components/holding/HoldingPlannerPanel";
import { PlaceDndProvider } from "../components/holding/PlaceSheet";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useAssistantStore } from "../stores/assistant-store";
import { useCaptureFeed } from "../hooks/inbox/use-capture-feed";
import { useIsCoarsePointer } from "../hooks/ui/use-coarse-pointer";
import { FocusViewBar } from "../components/focus-views/FocusViewBar";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useRouteViewMode } from "../hooks/ui/use-route-view-mode";
import { SortMenu } from "../components/shared/SortMenu";

export default function HomeRoute() {
    const shell = useShellMode();
    const coarse = useIsCoarsePointer();
    const { view, setView } = useRouteViewMode("capture");
    // Board is a desktop layout; compact shells always get rows.
    const board = !shell.isCompact && view === "kanban";
    const focusProxy = useRef<HTMLInputElement>(null);
    const [captureOpen, setCaptureOpen] = useState(false);
    // The draft lives with the page, so closing the sheet keeps it and needs no discard prompt.
    const { reset: _resetCapture, ...captureComposer } = useCaptureComposer({
        onSaved: () => {},
    });
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

    const captureFeed = useCaptureFeed();
    const inboxItems = [...captureFeed.inboxItems, ...captureFeed.notes];
    const tasksLoading = captureFeed.isLoading;
    const { holdingPanelOpen, holdingPanelWidth, setHoldingPanelWidth, toggleHoldingPanel, railView } = useRightPanelStore();
    const { assistantPanelOpen, toggleAssistantPanel } = useAssistantStore();

    useDocumentMeta(
        "Capture · Cadence",
        "Capture anything. Clarify later. Place when ready.",
    );

    useRouteFocus({ onFocusMatch: ({ focusKind, focusId }) => { if (focusKind === "inbox" && focusId) { setSelectedInboxItemId(focusId); setMobilePanelOpen(true); } } });

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
        <EditSidePanelRail ariaLabel="Resize Place panel" width={holdingPanelWidth} onWidthChange={setHoldingPanelWidth}>
            {hasPanelContent ? (
                selectedInboxItem ? (
                    <EditSidePanel kind="capture" item={selectedInboxItem} onClose={clearSelection}
                        onOpenFullEditor={(taskId) => { setSelectedInboxItemId(null); setSelectedTaskId(taskId); }} />
                ) : selectedTaskId ? (
                    <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
                ) : <HoldingPlannerPanel onSelectTask={(id) => handleSelectTask(id)} />
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
                        ? "Hide Place panel"
                        : "Show Place panel"
            }
        >
            {railOpen ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRightOpen size={18} aria-hidden="true" />}
        </Button>
    ) : shell.isCompact ? null : (
        <Button variant="ghost" size="icon"
            type="button"
            onClick={() => {
                clearSelection();
                setMobilePanelOpen(true);
            }}
            className="btn-icon rounded-2xl"
            aria-label="Place"
        >
            <CalendarDays size={16} aria-hidden="true" />
        </Button>
    );

    const feed = tasksLoading ? (
        <TaskListSkeleton />
    ) : (
        <HoldingFeed
            onSelectTask={handleSelectTask}
            onClarifyInboxItem={handleClarifyInboxItem}
            view={board ? "kanban" : "list"}
        />
    );

    return (
        <PlaceDndProvider><MainLayout
            requireAuth
            hideContextualOrb
            sidePanel={sidePanel}
            sidePanelActive={Boolean(hasPanelContent)}
            sidePanelLabel="Place"
            headerRight={<div className="flex items-center gap-2"><FocusViewBar capture />{!shell.isCompact && <SortMenu view={view} onViewChange={setView} />}{headerRight}</div>}
            compactHeaderRightInline
            shellHeader={{
                title: "Capture",
                eyebrow: "Unload",
                icon: <Inbox size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-capture, var(--accent-primary))",
            }}
        >
            {board ? <>
                <PageContent width="default">
                    <LocationNotice />
                    {!coarse && <CaptureInput />}
                </PageContent>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">{feed}</div>
            </> : <ScrollAreaWrapper><PageContent width="default">
                {!shell.isCompact && <LocationNotice />}
                {!coarse && <div className="mb-5"><CaptureInput /></div>}
                {feed}
            </PageContent></ScrollAreaWrapper>}
            {coarse && <>
                <input ref={focusProxy} tabIndex={-1} aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0" />
                <ContextualAddOrb directCapture onOpen={() => { focusProxy.current?.focus(); setCaptureOpen(true); }} />
                {/* Every return already saved, so closing is "Done", not a discard. */}
                <Composer open={captureOpen} onClose={() => setCaptureOpen(false)} {...captureComposer} isDirty={false} closeLabel="Done" />
            </>}

            {/* ── Mobile overlay — ClarifySheet / EditSidePanel / Overview (C4 fix) ── */}
            {!shell.isWide && (
                <ResponsiveOverlayPanel
                    ariaLabel={
                        selectedInboxItem ? "Clarify capture"
                            : selectedTaskId ? "Task details"
                            : "Place"
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
                            : "Place"
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
                            <HoldingPlannerPanel key="holding-mobile-planner" onSelectTask={(id) => handleSelectTask(id)} />
                        )}
                    </>
                </ResponsiveOverlayPanel>
            )}
        </MainLayout></PlaceDndProvider>
    );
}
