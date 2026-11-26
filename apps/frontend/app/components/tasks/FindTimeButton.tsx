import type { Task } from "@cadence/contracts/task";
import { canFindTime, useFindTime } from "../../hooks/tasks/use-find-time";
import { VALUE_BTN } from "../shared/DetailPanelSections";

export function FindTimeButton({ task }: { task: Task }) {
    const { run } = useFindTime();
    if (!canFindTime(task)) return null;
    return (
        <button
            type="button"
            onClick={() => void run(task)}
            className={`${VALUE_BTN} shrink-0 whitespace-nowrap text-accent-primary`}
        >
            Find a time
        </button>
    );
}
