import { DomainError } from "./errors";
import { addDays, dayOf, daysBetween, expandSeries, isValidRule, nextOccurrence, type Instant, type SeriesStart, type LocalDate, type Zone } from "./time";

/** The day window (LocalDates, inclusive) and paging needed to expand schedule-scoped repeating tasks. */
export type ScheduleScopeFilters = {
    from?: LocalDate;
    to?: LocalDate;
    limit?: number;
    offset?: number;
};

type TaskRow = {
    id: string;
    title: string;
    dueDate: LocalDate | null;
    endDate: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    zone: Zone | null;
    durationEstimate: number | null;
    recurrenceRule: string | null;
    interactionMode: "task" | "timetable";
    orderIndex: number;
    isPinned: boolean;
    tagIds?: string[];
    [key: string]: unknown;
};

export type RecurringTaskInstance<T extends TaskRow> = T & {
    seriesId?: string;
    isRecurringInstance?: true;
    occurrenceDay?: LocalDate;
    occurrenceStart?: Instant;
    occurrenceEnd?: Instant | null;
};

export function isScheduleScopedTaskQuery(filters: Pick<ScheduleScopeFilters, "from" | "to">) {
    return Boolean(filters.from && filters.to);
}

/** The day a task sits on for the user: its start's day (timed) or its due day (all-day). */
export function taskDay(task: Pick<TaskRow, "dueDate" | "scheduledStart">, zone: Zone): LocalDate | null {
    return task.scheduledStart ? dayOf(task.scheduledStart, zone) : task.dueDate;
}

/** A repeating task's rule must parse (`UNTIL` is a LocalDate, inclusive). */
export function validateTaskRecurrenceRule(recurrenceRule: string | null | undefined, zone: Zone = "UTC") {
    if (recurrenceRule && !isValidRule(recurrenceRule, zone)) {
        throw new DomainError("INVALID_RECURRENCE_RULE", "Recurrence rule could not be parsed", 400);
    }
}

function seriesStart(task: TaskRow, userZone: Zone): { zone: Zone; start: SeriesStart | null } {
    const zone = task.zone ?? userZone;
    return {
        zone,
        start: task.scheduledStart
            ? { instant: task.scheduledStart, end: task.scheduledEnd }
            : task.dueDate
              ? { day: task.dueDate }
              : null,
    };
}

/** The occurrence of a repeating task on or after `reference` (a day), else the one before it, else its start. */
export function resolveOccurrenceAnchor(task: TaskRow & { recurrenceRule: string }, reference: LocalDate, userZone: Zone): LocalDate | null {
    const { zone, start } = seriesStart(task, userZone);
    if (!start) return null;
    const first = "day" in start ? start.day : dayOf(start.instant, zone);
    const after = nextOccurrence({ rule: task.recurrenceRule, start, zone, from: reference });
    if (after) return after.day;
    const before = expandSeries({ rule: task.recurrenceRule, start, zone, range: { from: first, to: reference } }).at(-1);
    return before?.day ?? first;
}

/**
 * Expand a window of tasks: one-offs stay when their day is inside it, and each repeating
 * task becomes one instance per occurrence (`<seriesId>::<LocalDate>`). Timed series repeat in
 * the series zone, so the local time holds across DST changes.
 */
export function expandScheduleScopedTasks<T extends TaskRow>(
    tasks: T[],
    filters: Pick<ScheduleScopeFilters, "from" | "to" | "limit" | "offset">,
    userZone: Zone,
) {
    const { from, to } = filters;
    if (!from || !to) return tasks;

    const items: RecurringTaskInstance<T>[] = [];

    for (const task of tasks) {
        const series = task.recurrenceRule ? seriesStart(task, userZone) : null;
        if (!task.recurrenceRule || !series?.start) {
            const day = taskDay(task, userZone);
            if (day && day >= from && day <= to) items.push(task);
            continue;
        }

        const span = task.endDate && task.dueDate ? daysBetween(task.dueDate, task.endDate) : 0;
        for (const occurrence of expandSeries({ rule: task.recurrenceRule, start: series.start, zone: series.zone, range: { from, to } })) {
            items.push({
                ...task,
                id: `${task.id}::${occurrence.day}`,
                seriesId: task.id,
                isRecurringInstance: true,
                occurrenceDay: occurrence.day,
                ...(occurrence.start
                    ? {
                          occurrenceStart: occurrence.start,
                          occurrenceEnd: occurrence.end,
                          scheduledStart: occurrence.start,
                          scheduledEnd: occurrence.end,
                      }
                    : { dueDate: occurrence.day, endDate: task.endDate ? addDays(occurrence.day, span) : null }),
            });
        }
    }

    items.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
            return Number(b.isPinned) - Number(a.isPinned);
        }

        // Day first, then timed blocks in time order after the day's all-day items.
        const aDay = taskDay(a, userZone) ?? "";
        const bDay = taskDay(b, userZone) ?? "";
        if (aDay !== bDay) return aDay.localeCompare(bDay);
        const aStart = a.scheduledStart ?? "";
        const bStart = b.scheduledStart ?? "";
        if (aStart !== bStart) return aStart.localeCompare(bStart);

        return a.orderIndex - b.orderIndex;
    });

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return items.slice(offset, offset + limit);
}
