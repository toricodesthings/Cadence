import { useEffect } from "react";
import { OPEN_TASK_DETAILS_EVENT } from "../../lib/actions/task-details";

/** Let the active route open its task panel, including after an Undo restores a task. */
export function useTaskDetailsRequest(onOpen: (taskId: string) => void) {
    useEffect(() => {
        const handleOpen = (event: Event) => onOpen((event as CustomEvent<string>).detail);
        window.addEventListener(OPEN_TASK_DETAILS_EVENT, handleOpen);
        return () => window.removeEventListener(OPEN_TASK_DETAILS_EVENT, handleOpen);
    }, [onOpen]);
}
