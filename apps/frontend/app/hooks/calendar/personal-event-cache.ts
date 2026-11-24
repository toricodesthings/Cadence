import type { PersonalEvent } from "@cadence/contracts/personal-event";
import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const personalEventCache = createOptimisticHelpers<PersonalEvent>([queryKeys.personalEvents.all]);
