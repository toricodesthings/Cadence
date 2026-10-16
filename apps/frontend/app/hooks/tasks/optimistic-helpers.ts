import type { Task } from "@cadence/contracts/task";
import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const taskCache = createOptimisticHelpers<Task>([queryKeys.tasks.all]);
