import type { TaskFilters } from "@cadence/contracts/task";
import { normalizeStartBoundary, normalizeEndBoundary } from "@cadence/contracts/common";
import { addDaysToDate } from "@cadence/domain/repeats";

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
        // The date is the caller's local day; a timed task late that evening is already
        // tomorrow in UTC. Pad a day so it's included; callers keep exact local days.
        effectiveOnOrBeforeDateTime: filters.effectiveOnOrBeforeDate
            ? normalizeEndBoundary(addDaysToDate(filters.effectiveOnOrBeforeDate, 1))
            : undefined,
    };
}
