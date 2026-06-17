import type { Task } from "@cadence/contracts/task";
import {
    computeNextOrderIndex as nextOrderIndexFromIndices,
    computeMidpointIndex,
} from "@cadence/domain/ordering";

// Fractional ordering math is shared in @cadence/domain/ordering. This module
// keeps the Task-shaped convenience wrapper the FE call sites use.
export { computeMidpointIndex };

/** Compute the fractional orderIndex for inserting at the end of a task list. */
export function computeNextOrderIndex(tasks: Task[]): number {
    return nextOrderIndexFromIndices(tasks.map((t) => t.orderIndex));
}
