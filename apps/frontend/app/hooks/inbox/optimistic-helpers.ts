import type { InboxItem } from "@cadence/contracts/inbox";
import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const inboxCache = createOptimisticHelpers<InboxItem>([queryKeys.inbox.all]);
