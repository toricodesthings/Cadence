import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const habitCache = createOptimisticHelpers([
    queryKeys.habits.all,
    queryKeys.habits.weeklyAll,
    queryKeys.habits.unresolved,
]);
