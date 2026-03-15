import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

const taskCache = createOptimisticHelpers([queryKeys.tasks.all]);

export const snapshotTaskCache = taskCache.snapshot;
export const rollbackTaskCache = taskCache.rollback;
export const invalidateTaskCaches = taskCache.invalidate;
export const cancelTaskQueries = taskCache.cancel;
