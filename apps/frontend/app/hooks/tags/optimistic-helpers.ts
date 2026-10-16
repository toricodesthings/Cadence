import type { Tag } from "@cadence/contracts/tag";
import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const tagCache = createOptimisticHelpers<Tag>([queryKeys.tags.all]);
