import type { TaskFilters } from "../types/task";

export type NormalizedTaskFilters = Omit<TaskFilters, "scheduledRangeStart" | "scheduledRangeEnd"> & {
    scheduledRangeStart?: string;
    scheduledRangeEnd?: string;
    effectiveOnOrBeforeDateTime?: string;
    limit?: number;
    offset?: number;
};

export function isDateOnly(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeStartBoundary(value: string) {
    return isDateOnly(value) ? `${value}T00:00:00.000Z` : value;
}

export function normalizeEndBoundary(value: string) {
    return isDateOnly(value) ? `${value}T23:59:59.999Z` : value;
}

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
