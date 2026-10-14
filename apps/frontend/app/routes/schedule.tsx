import { DndContext, DragOverlay, closestCorners, pointerWithin } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { PeriodTodayPill } from "../components/layout/PeriodNav";
import { ScheduleCalendar } from "../components/calendar/ScheduleCalendar";
import { ScheduleOverlays } from "../components/calendar/ScheduleOverlays";
import { CalendarEventPopover } from "../components/calendar/CalendarEventPopover";
import { CalendarTaskChipOverlay } from "../components/calendar/CalendarTaskChip";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { LocationNotice } from "../components/location/LocationNotice";
import { Tip } from "../components/primitives";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { usePeriodSwipe } from "../hooks/ui/use-period-swipe";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useScheduleNavigation } from "../hooks/calendar/use-schedule-navigation";
import { useScheduleData } from "../hooks/calendar/use-schedule-data";
import { useScheduleSelection } from "../hooks/calendar/use-schedule-selection";
import { useScheduleTaskActions } from "../hooks/calendar/use-schedule-task-actions";
import { useScheduleDrag } from "../hooks/calendar/use-schedule-drag";
import { useScheduleCreation } from "../hooks/calendar/use-schedule-creation";
import { useScheduleShortcuts } from "../hooks/calendar/use-schedule-shortcuts";

export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";

export default function Schedule() {
    const shell = useShellMode();
    const navigation = useScheduleNavigation(shell);
    const data = useScheduleData({ currentDate: navigation.currentDate, viewMode: navigation.viewMode, todayIso: navigation.todayIso, isPhone: shell.isPhone });
    const selection = useScheduleSelection(data.allVisibleTasks, shell);
    const actions = useScheduleTaskActions(data.allVisibleTasks, navigation.todayIso, selection.handleSelectTask);
    const drag = useScheduleDrag(data.allVisibleTasks);
    const creation = useScheduleCreation(navigation.currentDate);
    useScheduleShortcuts(navigation, creation, selection);
    const swipe = usePeriodSwipe({ enabled: shell.isCompact && !drag.activeDragTask, onCommit: navigation.handleNavigate });
    useDocumentMeta("Schedule · Cadence", "View your week, day, month, and year with a calmer scheduling workspace built for focus.");

    const sidePanel = (
        <EditSidePanelRail ariaLabel="Resize schedule detail panel" defaultWidth={360} minWidth={300} maxWidth={520}>
            {shell.isWide && selection.selectedTaskId ? (
                <EditSidePanel kind="task" taskId={selection.selectedTaskId} onClose={() => selection.setSelectedTaskId(null)} />
            ) : null}
        </EditSidePanelRail>
    );
    return (
        <MainLayout requireAuth hideHeader hideContextualOrb sidePanel={sidePanel} sidePanelActive={Boolean(selection.selectedTaskId)} sidePanelLabel="Task">
            <DndContext sensors={drag.sensors}
                collisionDetection={(args) => {
                    const pointerCollisions = pointerWithin(args);
                    return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
                }}
                onDragStart={drag.handleDragStart} onDragOver={drag.handleDragOver}
                onDragCancel={drag.handleDragCancel} onDragEnd={drag.handleDragEnd}>
                <ScheduleCalendar shell={shell} navigation={navigation} data={data} selection={selection}
                    actions={actions} drag={drag} creation={creation} swipe={swipe} />
                <PeriodTodayPill show={shell.isPhone && navigation.isOffToday} reducedMotion={Boolean(swipe.reducedMotion)}
                    onToday={() => {
                        if (navigation.viewMode === "year") navigation.handleViewMode("month");
                        navigation.handleToday();
                    }} />
                {shell.isCompact ? (
                    <div className="layer-floating-bar pointer-events-none mobile-floating-action fixed bottom-5 right-4 flex flex-col items-end sm:right-5">
                        <Tip label="Add to schedule" side="left">
                            <button type="button" onClick={creation.handleAddTaskToolbar} aria-label="Add to schedule"
                                className="pointer-events-auto flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary text-[var(--primary-foreground)] shadow-[0_24px_54px_color-mix(in_srgb,var(--accent-primary)_34%,transparent)] transition-transform hover:scale-[1.02] active:scale-[0.98]">
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </Tip>
                    </div>
                ) : null}
                <AnimatePresence>
                    {creation.popover ? <CalendarEventPopover info={creation.popover.info} initialTab={creation.popover.tab} onClose={creation.close} /> : null}
                </AnimatePresence>
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.72, 0.32, 1)" }}>
                    {drag.activeDragTask ? <CalendarTaskChipOverlay task={drag.activeDragTask} /> : null}
                </DragOverlay>
            </DndContext>
            <ScheduleOverlays shell={shell} navigation={navigation} data={data} selection={selection} actions={actions} />
            <LocationNotice />
        </MainLayout>
    );
}
