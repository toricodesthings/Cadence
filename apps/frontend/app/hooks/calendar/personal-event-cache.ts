import type { SharedEvent } from "@cadence/contracts/personal-event";
import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const personalEventCache = createOptimisticHelpers<SharedEvent>([queryKeys.personalEvents.all]);
