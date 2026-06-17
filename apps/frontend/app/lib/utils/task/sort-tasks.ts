import type { Task } from "@cadence/contracts/task";
import { getTaskEffectiveAnchor } from "./task-scheduling";

export type SortMode = "smart" | "priority" | "manual";

/** Sort tasks by date/time-first (smart default) */
function smartSort(a: Task, b: Task): number {
    const anchorA = getTaskEffectiveAnchor(a) ?? "";
    const anchorB = getTaskEffectiveAnchor(b) ?? "";
    if (anchorA !== anchorB) return anchorA.localeCompare(anchorB);
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    return a.orderIndex - b.orderIndex;
}

/** Sort tasks by priority desc, pinned desc, then date/time */
function prioritySort(a: Task, b: Task): number {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    const anchorA = getTaskEffectiveAnchor(a) ?? "";
    const anchorB = getTaskEffectiveAnchor(b) ?? "";
    if (anchorA !== anchorB) return anchorA.localeCompare(anchorB);
    return a.orderIndex - b.orderIndex;
}

/** Sort tasks by orderIndex (manual drag ordering) */
function manualSort(a: Task, b: Task): number {
    return a.orderIndex - b.orderIndex;
}

/** Apply the given sort mode to a task array (returns a new sorted copy) */
export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
    const sorted = [...tasks];
    switch (mode) {
        case "smart":
            sorted.sort(smartSort);
            break;
        case "priority":
            sorted.sort(prioritySort);
            break;
        case "manual":
            sorted.sort(manualSort);
            break;
    }
    return sorted;
}
