import { rrulestr } from "rrule";
import { AppError } from "./errors";
import type { NormalizedTaskFilters } from "./task-filters";

type TaskRow = {
    id: string;
    title: string;
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    durationEstimate: number | null;
    isAllDay: boolean;
    recurrenceRule: string | null;
    orderIndex: number;
    isPinned: boolean;
    tagIds?: string[];
    [key: string]: unknown;
};

export type RecurringTaskInstance<T extends TaskRow> = T & {
    seriesId?: string;
    isRecurringInstance?: true;
    occurrenceStart?: string;
    occurrenceEnd?: string | null;
};

function getScheduleRange(filters: Pick<NormalizedTaskFilters, "scheduledDate" | "scheduledRangeStart" | "scheduledRangeEnd">) {
    if (filters.scheduledDate) {
        return {
            start: new Date(`${filters.scheduledDate}T00:00:00.000Z`),
            end: new Date(`${filters.scheduledDate}T23:59:59.999Z`),
        };
    }

    if (filters.scheduledRangeStart && filters.scheduledRangeEnd) {
        return {
            start: new Date(filters.scheduledRangeStart),
            end: new Date(filters.scheduledRangeEnd),
        };
    }

    return null;
}

function getTaskAnchor(task: Pick<TaskRow, "scheduledStart" | "dueDate">) {
    return task.scheduledStart ?? task.dueDate;
}

function getTimedDurationMs(task: Pick<TaskRow, "scheduledStart" | "scheduledEnd" | "durationEstimate">) {
    if (task.scheduledStart && task.scheduledEnd) {
        return Math.max(0, new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime());
    }

    return Math.max(5, task.durationEstimate ?? 60) * 60_000;
}

function buildRecurringInstanceId(seriesId: string, occurrenceStart: string) {
    return `${seriesId}::${occurrenceStart}`;
}

export function isScheduleScopedTaskQuery(
    filters: Pick<NormalizedTaskFilters, "scheduledDate" | "scheduledRangeStart" | "scheduledRangeEnd">,
) {
    return Boolean(filters.scheduledDate || (filters.scheduledRangeStart && filters.scheduledRangeEnd));
}

export function validateTaskRecurrenceRule(recurrenceRule: string | null | undefined, scheduledStart?: string | null) {
    if (!recurrenceRule) return;

    try {
        rrulestr(recurrenceRule, scheduledStart ? { dtstart: new Date(scheduledStart) } : undefined);
    } catch {
        throw new AppError(400, "INVALID_RECURRENCE_RULE", "Recurrence rule could not be parsed");
    }
}

export function expandScheduleScopedTasks<T extends TaskRow>(
    tasks: T[],
    filters: Pick<NormalizedTaskFilters, "scheduledDate" | "scheduledRangeStart" | "scheduledRangeEnd" | "limit" | "offset">,
) {
    const range = getScheduleRange(filters);
    if (!range) {
        return tasks;
    }

    const items: RecurringTaskInstance<T>[] = [];

    for (const task of tasks) {
        if (!task.recurrenceRule || task.isAllDay || !task.scheduledStart) {
            const anchor = getTaskAnchor(task);
            if (!anchor) continue;

            const anchorTime = new Date(anchor).getTime();
            if (anchorTime >= range.start.getTime() && anchorTime <= range.end.getTime()) {
                items.push(task);
            }
            continue;
        }

        const durationMs = getTimedDurationMs(task);
        let rule: ReturnType<typeof rrulestr>;

        try {
            rule = rrulestr(task.recurrenceRule, { dtstart: new Date(task.scheduledStart) });
        } catch {
            continue;
        }

        const starts = rule.between(range.start, range.end, true);
        for (const occurrenceDate of starts) {
            const occurrenceStart = occurrenceDate.toISOString();
            const occurrenceEnd = new Date(occurrenceDate.getTime() + durationMs).toISOString();

            items.push({
                ...task,
                id: buildRecurringInstanceId(task.id, occurrenceStart),
                seriesId: task.id,
                isRecurringInstance: true,
                occurrenceStart,
                occurrenceEnd,
                dueDate: occurrenceStart,
                scheduledStart: occurrenceStart,
                scheduledEnd: occurrenceEnd,
            });
        }
    }

    items.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
            return Number(b.isPinned) - Number(a.isPinned);
        }

        const aAnchor = getTaskAnchor(a) ?? "";
        const bAnchor = getTaskAnchor(b) ?? "";
        if (aAnchor !== bAnchor) {
            return aAnchor.localeCompare(bAnchor);
        }

        return a.orderIndex - b.orderIndex;
    });

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return items.slice(offset, offset + limit);
}
