import {
    formatDateSpan,
    formatShortDate,
    formatShortDateTime,
    formatTime,
    dayOfInstant,
} from "../date-format";
import { getUserZone, today } from "../user-zone";
import { classifyTaskReadShape, type TaskReadShape } from "@cadence/domain/task-temporal";
import { resolveOccurrenceAnchor } from "@cadence/domain/task-recurrence";
import { untilOf, type LocalDate } from "@cadence/domain/time";
import type { Task, TaskListQueryInput } from "@cadence/contracts/task";

export interface TaskScheduleSummary {
    kind: TaskReadShape;
    displayMode: "none" | "deadline" | "duration" | "timed";
    primaryLabel: string | null;
    secondaryLabel: string | null;
    isDeadline: boolean;
    isDuration: boolean;
    isTimed: boolean;
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

export function getTaskRecurrenceSummary(
    task: Pick<Task, "recurrenceRule" | "scheduledStart" | "scheduledEnd">,
): TaskRecurrenceSummary | null {
    if (!task.recurrenceRule) return null;

    const parts = parseRRuleParts(task.recurrenceRule);
    const freq = parts.get("FREQ");
    const weekdayLabel = formatWeekdayLabel(parts.get("BYDAY"));
    const until = untilOf(task.recurrenceRule, getUserZone());
    const endLabel = until ? formatShortDate(until) : null;
    const timeLabel = task.scheduledStart
        ? `${formatTime(task.scheduledStart)}${task.scheduledEnd ? ` – ${formatTime(task.scheduledEnd)}` : ""}`
        : null;

    const interval = Number(parts.get("INTERVAL") ?? 1);
    let cadenceLabel = "Repeats";
    if (freq === "DAILY") cadenceLabel = interval > 1 ? `Repeats every ${interval} days` : "Repeats daily";
    if (freq === "WEEKLY") {
        const every = interval === 2 ? "every other week" : interval > 2 ? `every ${interval} weeks` : null;
        cadenceLabel = every
            ? `Repeats ${every}${weekdayLabel ? ` on ${weekdayLabel}` : ""}`
            : weekdayLabel ? `Repeats ${weekdayLabel}` : "Repeats weekly";
    }
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

/** A Fixed block's next occurrence day on or after `referenceDay` (default today), else its own day. */
export function getPassiveTimetableOccurrenceAnchor(
    task: Pick<Task, "interactionMode" | "recurrenceRule" | "scheduledStart" | "dueDate" | "scheduledEnd" | "endDate" | "zone" | "id" | "title" | "orderIndex" | "isPinned" | "durationEstimate">,
    referenceDay: LocalDate = today(),
): LocalDate | null {
    const own = task.dueDate ?? (task.scheduledStart ? dayOfInstant(task.scheduledStart) : null);

    if (!isPassiveTimetableTask(task) || !task.recurrenceRule || !task.scheduledStart) return own;

    // Shared RRULE occurrence math lives in @cadence/domain; the passive-timetable
    // gating + fallback stay here in the presentation layer.
    return resolveOccurrenceAnchor({ ...task, recurrenceRule: task.recurrenceRule }, referenceDay, getUserZone()) ?? own;
}

export function getTaskScheduleSummary(
    task: Pick<Task, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "interactionMode">,
): TaskScheduleSummary {
    const kind = classifyTaskReadShape(task);

    switch (kind) {
        case "timed": {
            const start = task.scheduledStart!;
            const end = task.scheduledEnd;
            return {
                kind,
                displayMode: "timed",
                primaryLabel: end ? `${formatShortDateTime(start)} – ${formatTime(end)}` : formatShortDateTime(start),
                secondaryLabel: isPassiveTimetableTask(task) ? "Fixed" : "Time block",
                isDeadline: false,
                isDuration: false,
                isTimed: true,
                anchorDate: dayOfInstant(start),
            };
        }
        case "days":
            return {
                kind,
                displayMode: "duration",
                primaryLabel: formatDateSpan(task.dueDate!, task.endDate!),
                secondaryLabel: "Duration",
                isDeadline: false,
                isDuration: true,
                isTimed: false,
                anchorDate: task.dueDate!,
            };
        case "day":
            return {
                kind,
                displayMode: "deadline",
                primaryLabel: formatShortDate(task.dueDate!),
                secondaryLabel: "Deadline",
                isDeadline: true,
                isDuration: false,
                isTimed: false,
                anchorDate: task.dueDate!,
            };
        default:
            return {
                kind: "unscheduled",
                displayMode: "none",
                primaryLabel: null,
                secondaryLabel: null,
                isDeadline: false,
                isDuration: false,
                isTimed: false,
                anchorDate: null,
            };
    }
}

/** The day a task sits on: its due day, or the user's day of its start. */
export function getTaskEffectiveAnchor(task: Pick<Task, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "interactionMode">): LocalDate | null {
    return getTaskScheduleSummary(task).anchorDate;
}

export function getTaskTimelineAnchor(
    task: Parameters<typeof getPassiveTimetableOccurrenceAnchor>[0],
    referenceDay: LocalDate = today(),
): LocalDate | null {
    if (isPassiveTimetableTask(task)) return getPassiveTimetableOccurrenceAnchor(task, referenceDay);
    return getTaskEffectiveAnchor(task);
}

/** `GET /tasks` filters as views pass them: typed values, with the day window as one `{ from, to }` pair (LocalDates, inclusive). */
export type UseTasksFilterInput = Pick<TaskListQueryInput, "state" | "projectId" | "effectiveOnOrBeforeDate"> & {
    range?: { from: LocalDate; to: LocalDate };
    limit?: number;
    offset?: number;
    hasNoProject?: boolean;
    hasNoDate?: boolean;
};

/** The query string for `GET /tasks`, in the order the validator reads it. */
export function buildTasksQuery(filters: UseTasksFilterInput) {
    return {
        ...(filters.state && { state: filters.state }),
        ...(filters.projectId && { projectId: filters.projectId }),
        ...(filters.range && { from: filters.range.from, to: filters.range.to }),
        ...(filters.hasNoProject !== undefined && { hasNoProject: filters.hasNoProject ? "true" as const : "false" as const }),
        ...(filters.hasNoDate !== undefined && { hasNoDate: filters.hasNoDate ? "true" as const : "false" as const }),
        ...(filters.effectiveOnOrBeforeDate && { effectiveOnOrBeforeDate: filters.effectiveOnOrBeforeDate }),
        ...(filters.limit !== undefined && { limit: String(filters.limit) }),
        ...(filters.offset !== undefined && { offset: String(filters.offset) }),
    };
}
