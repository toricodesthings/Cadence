import type { Task } from "@cadence/contracts/task";
import { canFindTime, useFindTime } from "../../hooks/tasks/use-find-time";
import { VALUE_BTN } from "../shared/DetailPanelSections";

/**
 * "Find a time" in a task's details: one tap puts the task in the first gap that fits on its day, and the message
 * that follows offers Another time, Other day and Undo. Nothing else on the calendar moves.
 */
export function FindTimeButton({ task }: { task: Task }) {
    const { run } = useFindTime();
    if (!canFindTime(task)) return null;
    return (
        <button type="button" onClick={() => void run(task)} className={`${VALUE_BTN} shrink-0 whitespace-nowrap text-accent-primary`}>
            Find a time
        </button>
    );
}
