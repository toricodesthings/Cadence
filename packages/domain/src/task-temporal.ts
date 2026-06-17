import { DomainError } from "./errors";

export type TaskTemporalFields = {
    dueDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    isAllDay?: boolean | null;
};

export type TaskReadShape =
    | "unscheduled"
    | "deadline_only"
    | "timed_block"
    | "all_day_duration"
    | "legacy_all_day_with_start"
    | "legacy_mixed_timed_deadline";

// ── Pure boundary helpers (shared by backend filters + frontend) ──
export function isDateOnly(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeStartBoundary(value: string) {
    return isDateOnly(value) ? `${value}T00:00:00.000Z` : value;
}

export function normalizeEndBoundary(value: string) {
    return isDateOnly(value) ? `${value}T23:59:59.999Z` : value;
}

function normalizeAnchorDate(value: string | null | undefined) {
    if (!value) return null;
    // Use noon UTC for date-only strings to avoid timezone off-by-one
    // when clients parse the stored timestamp with local timezone getters.
    return isDateOnly(value) ? `${value}T12:00:00.000Z` : value;
}

function normalizeDurationEnd(value: string | null | undefined) {
    if (!value) return null;
    return isDateOnly(value) ? normalizeEndBoundary(value) : value;
}

function assertChronological(start: string, end: string, message: string) {
    if (new Date(end).getTime() < new Date(start).getTime()) {
        throw new DomainError("INVALID_TASK_SCHEDULE", message);
    }
}

/**
 * Legacy read compatibility matrix:
 * - timed rows win when `scheduledStart` exists and `isAllDay = false`, even if `dueDate` is also populated
 * - all-day rows with `scheduledStart` are tolerated as legacy; `dueDate` remains the canonical day anchor once rewritten
 * - all-day rows with `dueDate + scheduledEnd` are treated as multi-day duration tasks
 * - rows with no temporal fields are unscheduled
 */
export function classifyTaskReadShape(fields: TaskTemporalFields): TaskReadShape {
    if (!fields.dueDate && !fields.scheduledStart && !fields.scheduledEnd) {
        return "unscheduled";
    }

    if (fields.isAllDay === false && fields.scheduledStart) {
        return fields.dueDate ? "legacy_mixed_timed_deadline" : "timed_block";
    }

    if (fields.isAllDay !== false && fields.dueDate && fields.scheduledEnd) {
        return "all_day_duration";
    }

    if (fields.isAllDay !== false && fields.dueDate) {
        return fields.scheduledStart ? "legacy_all_day_with_start" : "deadline_only";
    }

    if (fields.scheduledStart) {
        return "legacy_all_day_with_start";
    }

    return "deadline_only";
}

export function hasTaskTemporalMutation(fields: Partial<TaskTemporalFields>) {
    return ["dueDate", "scheduledStart", "scheduledEnd", "isAllDay"].some((key) => key in fields);
}

export function normalizeTaskTemporalFields(fields: TaskTemporalFields) {
    const isAllDay = fields.isAllDay ?? true;
    const normalizedDueDate = normalizeAnchorDate(fields.dueDate);
    const normalizedScheduledStart = normalizeAnchorDate(fields.scheduledStart);
    const normalizedScheduledEnd = normalizeDurationEnd(fields.scheduledEnd);

    const hasTemporalData = Boolean(normalizedDueDate || normalizedScheduledStart || normalizedScheduledEnd);

    if (!hasTemporalData) {
        if (!isAllDay) {
            throw new DomainError("INVALID_TASK_SCHEDULE", "Timed tasks require scheduledStart");
        }

        return {
            dueDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            isAllDay,
        };
    }

    if (!isAllDay) {
        if (!normalizedScheduledStart) {
            throw new DomainError("INVALID_TASK_SCHEDULE", "Timed tasks require scheduledStart");
        }

        if (normalizedScheduledEnd) {
            assertChronological(normalizedScheduledStart, normalizedScheduledEnd, "scheduledEnd must not be earlier than scheduledStart");
        }

        // Preserve dueDate when the client sends both — a "timed deadline" is valid
        // (the read model already handles this as "legacy_mixed_timed_deadline")
        return {
            dueDate: normalizedDueDate,
            scheduledStart: normalizedScheduledStart,
            scheduledEnd: normalizedScheduledEnd,
            isAllDay: false,
        };
    }

    const allDayAnchor = normalizedDueDate ?? normalizedScheduledStart;
    if (!allDayAnchor) {
        throw new DomainError("INVALID_TASK_SCHEDULE", "All-day tasks require a dueDate or day anchor");
    }

    if (normalizedScheduledEnd) {
        assertChronological(allDayAnchor, normalizedScheduledEnd, "scheduledEnd must not be earlier than the all-day anchor");
    }

    return {
        dueDate: allDayAnchor,
        scheduledStart: null,
        scheduledEnd: normalizedScheduledEnd,
        isAllDay: true,
    };
}
