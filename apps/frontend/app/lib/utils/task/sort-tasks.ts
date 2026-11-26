import type { z } from "zod";
import type { focusViewSortModeSchema } from "@cadence/contracts/settings";
import type { Task } from "@cadence/contracts/task";
import { getTaskEffectiveAnchor } from "./task-scheduling";

export type SortMode = z.infer<typeof focusViewSortModeSchema>;

function smartSort(a: Task, b: Task): number {
    const anchorA = getTaskEffectiveAnchor(a) ?? "";
    const anchorB = getTaskEffectiveAnchor(b) ?? "";
    if (anchorA !== anchorB) return anchorA.localeCompare(anchorB);
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    return a.orderIndex - b.orderIndex;
}

function prioritySort(a: Task, b: Task): number {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    const anchorA = getTaskEffectiveAnchor(a) ?? "";
    const anchorB = getTaskEffectiveAnchor(b) ?? "";
    if (anchorA !== anchorB) return anchorA.localeCompare(anchorB);
    return a.orderIndex - b.orderIndex;
}

function manualSort(a: Task, b: Task): number {
    return a.orderIndex - b.orderIndex;
}

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
