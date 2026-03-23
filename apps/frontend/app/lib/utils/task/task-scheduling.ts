import {
    formatDateSpan,
    formatShortDate,
    formatShortDateTime,
    formatTime,
    parseLocalDate,
    toISODate,
} from "../date-format";
import { rrulestr } from "rrule";
import type { Task } from "../../../types/task";

const canonicalAllDayDateTimePattern = /^(\d{4}-\d{2}-\d{2})T(?:00:00:00(?:\.000)?|12:00:00(?:\.000)?|23:59:59\.999)Z$/;

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

const RRULE_DAY_LABELS: Record<string, string> = {
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
    SU: "Sun",
};

export interface TaskRecurrenceSummary {
    label: string;
    cadenceLabel: string;
    detailLabel: string | null;
    weekdayLabel: string | null;
    endLabel: string | null;
}

function parseRRuleParts(rule: string | null | undefined) {
    if (!rule) return new Map<string, string>();

    return new Map(
        rule
            .split(";")
            .map((part) => part.split("="))
            .filter((part): part is [string, string] => part.length === 2),
    );
}

function formatWeekdayLabel(byDay: string | null | undefined) {
    if (!byDay) return null;
    const labels = byDay
        .split(",")
        .map((value) => RRULE_DAY_LABELS[value] ?? value)
        .filter(Boolean);

    if (labels.length === 0) return null;
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")} & ${labels.at(-1)}`;
}

function formatUntilLabel(untilValue: string | null | undefined) {
    if (!untilValue) return null;
    if (/^\d{8}T\d{6}Z$/.test(untilValue)) {
        return formatShortDate(`${untilValue.slice(0, 4)}-${untilValue.slice(4, 6)}-${untilValue.slice(6, 8)}`);
    }
    if (/^\d{8}$/.test(untilValue)) {
        return formatShortDate(`${untilValue.slice(0, 4)}-${untilValue.slice(4, 6)}-${untilValue.slice(6, 8)}`);
    }
    return formatShortDate(untilValue);
}

export function isRecurringTask(task: Pick<Task, "recurrenceRule">) {
    return Boolean(task.recurrenceRule);
}

export function isRecurringTaskInstance(task: Pick<Task, "isRecurringInstance" | "seriesId">) {
    return Boolean(task.isRecurringInstance || task.seriesId);
}

export function isPassiveTimetableTask(task: Pick<Task, "interactionMode">) {
    return task.interactionMode === "timetable";
}

export function supportsManualTaskCompletion(task: Pick<Task, "interactionMode">) {
    return !isPassiveTimetableTask(task);
}

export function getTaskSeriesId(task: Pick<Task, "id" | "seriesId">) {
    return task.seriesId ?? task.id;
}

export function getTaskMutationTargetId(task: Pick<Task, "id" | "seriesId">) {
    return getTaskSeriesId(task);
}

export function getTaskRecurrenceSummary(
    task: Pick<Task, "recurrenceRule" | "scheduledStart" | "scheduledEnd">,
): TaskRecurrenceSummary | null {
    if (!task.recurrenceRule) return null;

    const parts = parseRRuleParts(task.recurrenceRule);
    const freq = parts.get("FREQ");
    const weekdayLabel = formatWeekdayLabel(parts.get("BYDAY"));
    const endLabel = formatUntilLabel(parts.get("UNTIL"));
    const timeLabel = task.scheduledStart
        ? `${formatTime(task.scheduledStart)}${task.scheduledEnd ? ` - ${formatTime(task.scheduledEnd)}` : ""}`
        : null;

    let cadenceLabel = "Repeats";
    if (freq === "DAILY") cadenceLabel = "Repeats daily";
    if (freq === "WEEKLY" && weekdayLabel) cadenceLabel = `Repeats ${weekdayLabel}`;
    if (freq === "WEEKLY" && !weekdayLabel) cadenceLabel = "Repeats weekly";
    if (freq === "MONTHLY") cadenceLabel = "Repeats monthly";

    const detailParts = [weekdayLabel ? `every ${weekdayLabel}` : null, timeLabel, endLabel ? `until ${endLabel}` : null].filter(Boolean);

    return {
        label: [cadenceLabel, timeLabel, endLabel ? `until ${endLabel}` : null].filter(Boolean).join(", "),
        cadenceLabel,
        detailLabel: detailParts.length > 0 ? detailParts.join(", ") : null,
        weekdayLabel,
        endLabel,
    };
}

function startOfLocalDay(referenceDate: Date) {
    return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
}

export function getPassiveTimetableOccurrenceAnchor(
    task: Pick<Task, "interactionMode" | "recurrenceRule" | "scheduledStart" | "dueDate">,
    referenceDate = new Date(),
) {
    const fallbackAnchor = task.scheduledStart ?? task.dueDate;

    if (!isPassiveTimetableTask(task) || !task.recurrenceRule || !task.scheduledStart) {
        return fallbackAnchor;
    }

    try {
        const rule = rrulestr(task.recurrenceRule, { dtstart: new Date(task.scheduledStart) });
        const occurrence =
            rule.after(startOfLocalDay(referenceDate), true)
            ?? rule.before(startOfLocalDay(referenceDate), true)
            ?? new Date(task.scheduledStart);
        return occurrence.toISOString();
    } catch {
        return fallbackAnchor;
    }
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

export function getTaskScheduleSummary(
    task: Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "isAllDay" | "interactionMode">,
): TaskScheduleSummary {
    const passiveTimetable = isPassiveTimetableTask(task);
    const kind = getTaskScheduleKind(task);

    switch (kind) {
        case "timed": {
            const start = task.scheduledStart!;
            const end = task.scheduledEnd;
            return {
                kind,
                displayMode: "timed",
                primaryLabel: end ? `${formatShortDateTime(start)} - ${formatTime(end)}` : formatShortDateTime(start),
                secondaryLabel: passiveTimetable ? "Timetable anchor" : "Time block",
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
                secondaryLabel: passiveTimetable ? "Timetable anchor" : "Time block",
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

export function getTaskEffectiveAnchor(
    task: Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "isAllDay" | "interactionMode">,
) {
    const summary = getTaskScheduleSummary(task);
    return summary.anchorDate;
}

export function getTaskTimelineAnchor(
    task: Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "isAllDay" | "interactionMode" | "recurrenceRule">,
    referenceDate = new Date(),
) {
    if (isPassiveTimetableTask(task)) {
        return toTaskDateOnly(getPassiveTimetableOccurrenceAnchor(task, referenceDate));
    }

    return getTaskEffectiveAnchor(task);
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
