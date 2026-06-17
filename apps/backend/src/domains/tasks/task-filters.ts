import type { TaskFilters } from "./tasks.schema";
import { normalizeStartBoundary, normalizeEndBoundary } from "@cadence/domain/task-temporal";

export type NormalizedTaskFilters = Omit<TaskFilters, "scheduledRangeStart" | "scheduledRangeEnd"> & {
    scheduledRangeStart?: string;
    scheduledRangeEnd?: string;
    effectiveOnOrBeforeDateTime?: string;
    limit?: number;
    offset?: number;
};

export function normalizeTaskFilters(filters: TaskFilters): NormalizedTaskFilters {
    return {
        ...filters,
        scheduledRangeStart: filters.scheduledRangeStart ? normalizeStartBoundary(filters.scheduledRangeStart) : undefined,
        scheduledRangeEnd: filters.scheduledRangeEnd ? normalizeEndBoundary(filters.scheduledRangeEnd) : undefined,
        effectiveOnOrBeforeDateTime: filters.effectiveOnOrBeforeDate
            ? normalizeEndBoundary(filters.effectiveOnOrBeforeDate)
            : undefined,
    };
}
