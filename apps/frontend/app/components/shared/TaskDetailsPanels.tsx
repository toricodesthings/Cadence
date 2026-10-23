import type { useTaskDetailSelection } from "../../hooks/ui/use-task-detail-selection";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { EditSidePanel } from "./EditSidePanel";
import { EditSidePanelRail } from "./EditSidePanelRail";
import { ResponsiveOverlayPanel } from "./ResponsiveOverlayPanel";

type Selection = ReturnType<typeof useTaskDetailSelection>;

/** At wide widths, a task list route's selected task opens in the resizable side rail. */
export function TaskDetailsRail({ selection, ariaLabel, minWidth, maxWidth }: { selection: Selection; ariaLabel: string; minWidth?: number; maxWidth?: number }) {
    const shell = useShellMode();
    const { selectedTaskId, setSelectedTaskId } = selection;
    return (
        <EditSidePanelRail ariaLabel={ariaLabel} minWidth={minWidth} maxWidth={maxWidth}>
            {shell.isWide && selectedTaskId ? <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} /> : null}
        </EditSidePanelRail>
    );
}

/** Below wide widths, a task list route's selected task opens as a sheet. `clearOnClose` also drops the selection. */
export function PhoneTaskDetails({ selection, ariaLabel, clearOnClose = false }: { selection: Selection; ariaLabel: string; clearOnClose?: boolean }) {
    const shell = useShellMode();
    const { selectedTaskId, setSelectedTaskId, mobilePanelOpen, setMobilePanelOpen, mobileDetailMode, setMobileDetailMode } = selection;
    if (shell.isWide || !selectedTaskId) return null;
    const close = () => {
        setSelectedTaskId(null);
        setMobilePanelOpen(false);
    };
    return (
        <ResponsiveOverlayPanel ariaLabel={ariaLabel} open={mobilePanelOpen} onClose={clearOnClose ? close : () => setMobilePanelOpen(false)} mode={mobileDetailMode}>
            <EditSidePanel kind="task" key={selectedTaskId} taskId={selectedTaskId} detailMode={mobileDetailMode} onDetailModeChange={setMobileDetailMode} onClose={close} />
        </ResponsiveOverlayPanel>
    );
}
