import { toast } from "sonner";
import { DurationChips } from "../../components/assistant/DurationChips";
import { today } from "../utils/user-zone";

const ASKED_KEY = "cadence-duration-asked-on";
const SHOWN_MS = 9_000;

/** True the first time on each local day: the question is asked at most once a day. */
function firstToday(): boolean {
    try {
        const day = today();
        if (localStorage.getItem(ASKED_KEY) === day) return false;
        localStorage.setItem(ASKED_KEY, day);
        return true;
    } catch {
        return false; // no storage: never nag
    }
}

/**
 * After the person completes a task, in Full, ask how long it took: once a day at most, never required,
 * and skipping records nothing. `report` sends the answer.
 */
export function offerDuration(task: { id: string; title: string }, memoryMode: string | null | undefined, report: (input: { taskId: string; minutes: number }) => void) {
    if (memoryMode !== "full" || !firstToday()) return;
    toast.custom((id) => <DurationChips id={id} title={task.title} onPick={(minutes) => report({ taskId: task.id, minutes })} />, { duration: SHOWN_MS });
}
