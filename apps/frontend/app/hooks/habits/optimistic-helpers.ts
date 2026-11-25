import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const habitCache = createOptimisticHelpers<{ id: string }>([queryKeys.habits.all, queryKeys.habits.weeklyAll]);
