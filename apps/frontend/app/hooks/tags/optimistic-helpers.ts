import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const tagCache = createOptimisticHelpers([queryKeys.tags.all]);
