import type { Project } from "@cadence/contracts/project";
import { createOptimisticHelpers } from "../../lib/api/optimistic-factory";
import { queryKeys } from "../../lib/api/query-keys";

export const projectCache = createOptimisticHelpers<Project>([queryKeys.projects.all]);
