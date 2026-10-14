import { EditSidePanel } from "../shared/EditSidePanel";
import { ResponsiveOverlayPanel } from "../shared/ResponsiveOverlayPanel";
import { PlaceSheet } from "../holding/PlaceSheet";
import { LightenTodaySheet, ReadyToPlaceSheet } from "./phone/ScheduleSheets";
import type { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { ScheduleNavigation } from "../../hooks/calendar/use-schedule-navigation";
import type { ScheduleData } from "../../hooks/calendar/use-schedule-data";
import type { ScheduleSelection } from "../../hooks/calendar/use-schedule-selection";
import type { ScheduleTaskActions } from "../../hooks/calendar/use-schedule-task-actions";

export function ScheduleOverlays({ shell, navigation, data, selection, actions }: {
    shell: ReturnType<typeof useShellMode>;
    navigation: ScheduleNavigation;
    data: ScheduleData;
    selection: ScheduleSelection;
    actions: ScheduleTaskActions;
}) {
    const { selectedTaskId, selectedHabit: selectedHabitRef, clearSelection,
        mobileDetailMode, setMobileDetailMode, handleSelectTask } = selection;
    const { placeTask, setPlaceTask, readyOpen, setReadyOpen, lightenOpen, setLightenOpen, moveTaskToDay, lightenToday } = actions;
    const { readyTasks, lightenCandidates, habitById } = data;
    const { currentDate } = navigation;
    const selectedHabit = selectedHabitRef ? habitById.get(selectedHabitRef.id) ?? null : null;
    return <>
        {!shell.isWide && selectedTaskId && (
            <ResponsiveOverlayPanel
                ariaLabel="Schedule task details"
                open={Boolean(selectedTaskId)}
                onClose={clearSelection}
                mode={mobileDetailMode}
            >
                <EditSidePanel kind="task"
                    taskId={selectedTaskId}
                    detailMode={mobileDetailMode}
                    onDetailModeChange={setMobileDetailMode}
                    onClose={clearSelection}
                />
            </ResponsiveOverlayPanel>
        )}
        {!shell.isWide && selectedHabit && selectedHabitRef ? (
            <ResponsiveOverlayPanel ariaLabel="Routine details" open onClose={clearSelection} mode="peek">
                <EditSidePanel kind="habit" habit={selectedHabit} day={selectedHabitRef.day} onOpenInRoutines={() => selection.openInRoutines(selectedHabit.id)} onClose={clearSelection} />
            </ResponsiveOverlayPanel>
        ) : null}
        <PlaceSheet
            open={Boolean(placeTask)}
            task={placeTask}
            onClose={() => setPlaceTask(null)}
            onOpenTask={handleSelectTask}
            onPlace={(task, iso) => moveTaskToDay(task, iso)}
        />
        {shell.isPhone ? (
            <>
                <ReadyToPlaceSheet open={readyOpen} dateIso={currentDate} tasks={readyTasks} onClose={() => setReadyOpen(false)} />
                <LightenTodaySheet open={lightenOpen} tasks={lightenCandidates} onClose={() => setLightenOpen(false)} onMove={lightenToday} />
            </>
        ) : null}
    </>;
}
