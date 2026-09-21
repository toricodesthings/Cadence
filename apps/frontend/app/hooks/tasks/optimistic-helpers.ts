import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const taskCache = createOptimisticHelpers([queryKeys.tasks.all]);
