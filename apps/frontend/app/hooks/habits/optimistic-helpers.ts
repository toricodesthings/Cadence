import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

const habitCache = createOptimisticHelpers([
    queryKeys.habits.all,
    queryKeys.habits.weeklyAll,
    queryKeys.habits.unresolved,
]);

export const snapshotHabitCache = habitCache.snapshot;
export const rollbackHabitCache = habitCache.rollback;
export const invalidateHabitCaches = habitCache.invalidate;
export const cancelHabitQueries = habitCache.cancel;
