import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const projectCache = createOptimisticHelpers([queryKeys.projects.all]);
