import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

const habitCache = createOptimisticHelpers([queryKeys.habits.all]);

export const snapshotHabitCache = habitCache.snapshot;
export const rollbackHabitCache = habitCache.rollback;
export const invalidateHabitCaches = habitCache.invalidate;
export const cancelHabitQueries = habitCache.cancel;
