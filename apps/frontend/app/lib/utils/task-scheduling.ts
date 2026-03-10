import {
    formatDateSpan,
    formatShortDate,
    formatShortDateTime,
    formatTime,
    parseLocalDate,
    toISODate,
} from "./date-format";
import type { Task } from "../../types/task";

const canonicalAllDayDateTimePattern = /^(\d{4}-\d{2}-\d{2})T(?:00:00:00(?:\.000)?|23:59:59\.999)Z$/;

export type TaskScheduleKind =
    | "unscheduled"
    | "deadline"
    | "duration"
    | "timed"
    | "legacy-all-day-start"
    | "legacy-mixed-timed-deadline";

export interface TaskScheduleSummary {
    kind: TaskScheduleKind;
    displayMode: "none" | "deadline" | "duration" | "timed";
    primaryLabel: string | null;
    secondaryLabel: string | null;
    isDeadline: boolean;
    isDuration: boolean;
    isTimed: boolean;
    needsNormalization: boolean;
    anchorDate: string | null;
}

export function toTaskDateOnly(value: string | null | undefined) {
    if (!value) return null;
    if (value.length === 10) return value;

    const canonicalAllDayMatch = value.match(canonicalAllDayDateTimePattern);
    if (canonicalAllDayMatch) {
        return canonicalAllDayMatch[1];
    }

    return toISODate(parseLocalDate(value));
}

export function getTaskScheduleKind(task: Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "isAllDay">): TaskScheduleKind {
    if (!task.dueDate && !task.scheduledStart && !task.scheduledEnd) {
        return "unscheduled";
    }

    if (task.isAllDay === false && task.scheduledStart) {
        return task.dueDate ? "legacy-mixed-timed-deadline" : "timed";
    }

    if (task.isAllDay !== false && task.dueDate && task.scheduledEnd) {
        return "duration";
    }

    if (task.isAllDay !== false && task.dueDate) {
        return task.scheduledStart ? "legacy-all-day-start" : "deadline";
    }

    if (task.scheduledStart) {
        return "legacy-all-day-start";
    }

    return "deadline";
}

export function getTaskScheduleSummary(task: Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "isAllDay">): TaskScheduleSummary {
    const kind = getTaskScheduleKind(task);

    switch (kind) {
        case "timed": {
            const start = task.scheduledStart!;
            const end = task.scheduledEnd;
            return {
                kind,
                displayMode: "timed",
                primaryLabel: end ? `${formatShortDateTime(start)} - ${formatTime(end)}` : formatShortDateTime(start),
                secondaryLabel: "Time block",
                isDeadline: false,
                isDuration: false,
                isTimed: true,
                needsNormalization: false,
                anchorDate: toTaskDateOnly(start),
            };
        }
        case "legacy-mixed-timed-deadline": {
            const start = task.scheduledStart!;
            const end = task.scheduledEnd;
            return {
                kind,
                displayMode: "timed",
                primaryLabel: end ? `${formatShortDateTime(start)} - ${formatTime(end)}` : formatShortDateTime(start),
                secondaryLabel: "Time block",
                isDeadline: false,
                isDuration: false,
                isTimed: true,
                needsNormalization: true,
                anchorDate: toTaskDateOnly(start),
            };
        }
        case "duration": {
            const start = toTaskDateOnly(task.dueDate!)!;
            const end = toTaskDateOnly(task.scheduledEnd!)!;
            return {
                kind,
                displayMode: "duration",
                primaryLabel: formatDateSpan(start, end),
                secondaryLabel: "Duration",
                isDeadline: false,
                isDuration: true,
                isTimed: false,
                needsNormalization: false,
                anchorDate: start,
            };
        }
        case "deadline": {
            const dueDate = toTaskDateOnly(task.dueDate!)!;
            return {
                kind,
                displayMode: "deadline",
                primaryLabel: formatShortDate(dueDate),
                secondaryLabel: "Deadline",
                isDeadline: true,
                isDuration: false,
                isTimed: false,
                needsNormalization: false,
                anchorDate: dueDate,
            };
        }
        case "legacy-all-day-start": {
            const anchor = toTaskDateOnly(task.dueDate ?? task.scheduledStart!)!;
            return {
                kind,
                displayMode: "deadline",
                primaryLabel: formatShortDate(anchor),
                secondaryLabel: "Deadline",
                isDeadline: true,
                isDuration: false,
                isTimed: false,
                needsNormalization: true,
                anchorDate: anchor,
            };
        }
        default:
            return {
                kind: "unscheduled",
                displayMode: "none",
                primaryLabel: null,
                secondaryLabel: null,
                isDeadline: false,
                isDuration: false,
                isTimed: false,
                needsNormalization: false,
                anchorDate: null,
            };
    }
}

export function getTaskEffectiveAnchor(task: Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "isAllDay">) {
    const summary = getTaskScheduleSummary(task);
    return summary.anchorDate;
}

export interface UseTasksFilterInput {
    state?: string;
    projectId?: string;
    scheduledDate?: string;
    scheduledRange?: { start: string; end: string };
    limit?: number;
    offset?: number;
    hasNoProject?: boolean;
    hasNoDate?: boolean;
    effectiveOnOrBeforeDate?: string;
}

export function buildTasksQuery(filters: UseTasksFilterInput) {
    return {
        ...(filters.state && { state: filters.state }),
        ...(filters.projectId && { projectId: filters.projectId }),
        ...(filters.scheduledDate && { scheduledDate: filters.scheduledDate }),
        ...(filters.scheduledRange?.start && { scheduledRangeStart: filters.scheduledRange.start }),
        ...(filters.scheduledRange?.end && { scheduledRangeEnd: filters.scheduledRange.end }),
        ...(filters.hasNoProject !== undefined && { hasNoProject: String(filters.hasNoProject) }),
        ...(filters.hasNoDate !== undefined && { hasNoDate: String(filters.hasNoDate) }),
        ...(filters.effectiveOnOrBeforeDate && { effectiveOnOrBeforeDate: filters.effectiveOnOrBeforeDate }),
        ...(filters.limit !== undefined && { limit: String(filters.limit) }),
        ...(filters.offset !== undefined && { offset: String(filters.offset) }),
    };
}
