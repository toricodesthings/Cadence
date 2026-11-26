import type { Task } from "@cadence/contracts/task";
import { computeNextOrderIndex as nextOrderIndexFromIndices, computeMidpointIndex } from "@cadence/domain/ordering";

export { computeMidpointIndex };

export function computeNextOrderIndex(tasks: Task[]): number {
    return nextOrderIndexFromIndices(tasks.map((t) => t.orderIndex));
}
