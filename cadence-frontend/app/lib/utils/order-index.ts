import type { Task } from "../../types/task";

/** Compute the fractional orderIndex for inserting at the end of a task list */
export function computeNextOrderIndex(tasks: Task[]): number {
    if (tasks.length === 0) return 1;
    return Math.max(...tasks.map((t) => t.orderIndex)) + 1;
}

/** Compute the fractional orderIndex for inserting between two neighbors */
export function computeMidpointIndex(
    prevIndex: number | undefined,
    nextIndex: number | undefined,
    fallback: number,
): number {
    if (prevIndex !== undefined && nextIndex !== undefined) {
        return (prevIndex + nextIndex) / 2;
    }
    if (prevIndex !== undefined) return prevIndex + 1;
    if (nextIndex !== undefined) return nextIndex - 1;
    return fallback;
}
