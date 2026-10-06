import { DomainError } from "./errors";
import { addDays, atLocal, dayOf, daysBetween, isLocalDate, isZone, legacyDay, wallTimeOf, type Instant, type LocalDate, type Zone } from "./time";

/** What a task write may carry. `isAllDay` is time-legacy (old clients); all-day is simply "no start". */
export type TaskTemporalFields = {
    dueDate?: string | null;
    endDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    zone?: string | null;
    isAllDay?: boolean | null;
};

/** The stored temporal shape of a task: days are LocalDates, timed values are instants plus the zone they were planned in. */
export type TaskTemporal = {
    dueDate: LocalDate | null;
    endDate: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    zone: Zone | null;
};

export type TaskReadShape = "unscheduled" | "day" | "days" | "timed";

/** unscheduled · day (all-day, with or without a deadline) · days (all-day multi-day) · timed. */
export function classifyTaskReadShape(fields: Pick<TaskTemporal, "dueDate" | "endDate" | "scheduledStart">): TaskReadShape {
    if (fields.scheduledStart) return "timed";
    if (fields.dueDate && fields.endDate) return "days";
    return fields.dueDate ? "day" : "unscheduled";
}

export function hasTaskTemporalMutation(fields: Partial<TaskTemporalFields>) {
    return ["dueDate", "endDate", "scheduledStart", "scheduledEnd", "zone", "isAllDay"].some((key) => key in fields);
}

function assertInstant(value: string, field: string) {
    if (isLocalDate(value) || !Number.isFinite(Date.parse(value))) {
        throw new DomainError("INVALID_TASK_SCHEDULE", `${field} must be a date and time with an offset`);
    }
}

/**
 * Validate a task write into its stored shape (`zone` is the user's zone). Takes new values
 * (LocalDates and instants) and, time-legacy, the old ones: an instant in a day field is read
 * with `legacyDay`, `isAllDay: true` with a start means the start only names the day. `onLegacy`
 * hears each legacy field so the server can log `legacy_time_shape`.
 */
export function normalizeTaskTemporalFields(fields: TaskTemporalFields, zone: Zone, onLegacy: (field: string) => void = () => {}): TaskTemporal {
    if (!isZone(zone)) throw new DomainError("INVALID_TASK_SCHEDULE", "A time zone is required");
    const day = (value: string | null | undefined, field: string): LocalDate | null => {
        if (!value) return null;
        if (isLocalDate(value)) return value;
        onLegacy(field);
        return legacyDay(value, zone);
    };
    if (fields.isAllDay != null) onLegacy("isAllDay");

    const start = fields.scheduledStart || null;
    const end = fields.scheduledEnd || null;
    const nothing: TaskTemporal = { dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null };
    if (!start && !end && !fields.dueDate && !fields.endDate) {
        if (fields.isAllDay === false) throw new DomainError("INVALID_TASK_SCHEDULE", "Timed tasks require scheduledStart");
        return nothing;
    }

    // A timed block: a real instant start (an old client's isAllDay: true with a start is all-day).
    if (start && fields.isAllDay !== true && !isLocalDate(start)) {
        assertInstant(start, "scheduledStart");
        if (end) {
            assertInstant(end, "scheduledEnd");
            if (Date.parse(end) < Date.parse(start)) throw new DomainError("INVALID_TASK_SCHEDULE", "scheduledEnd must not be earlier than scheduledStart");
        }
        if (fields.endDate) throw new DomainError("INVALID_TASK_SCHEDULE", "A timed task has no endDate; use scheduledEnd");
        const taskZone = fields.zone ?? zone;
        if (!isZone(taskZone)) throw new DomainError("INVALID_TASK_SCHEDULE", "zone must be an IANA time zone");
        return { dueDate: day(fields.dueDate, "dueDate"), endDate: null, scheduledStart: start, scheduledEnd: end, zone: taskZone };
    }
    if (fields.isAllDay === false) throw new DomainError("INVALID_TASK_SCHEDULE", "Timed tasks require scheduledStart");

    // An all-day task: a day, and for a multi-day task its inclusive last day.
    if (start) onLegacy("scheduledStart");
    if (end) onLegacy("scheduledEnd");
    const dueDate = day(fields.dueDate, "dueDate") ?? (start ? legacyDay(start, zone) : null);
    const endDate = day(fields.endDate, "endDate") ?? (end ? legacyDay(end, zone) : null);
    if (!dueDate) throw new DomainError("INVALID_TASK_SCHEDULE", "All-day tasks require a dueDate");
    if (endDate && endDate < dueDate) throw new DomainError("INVALID_TASK_SCHEDULE", "endDate must not be earlier than dueDate");
    return { dueDate, endDate, scheduledStart: null, scheduledEnd: null, zone: null };
}

/**
 * One task moved to a local `day`, keeping its shape: an all-day task lands on the day (its end
 * moves by the same number of days); a timed task keeps its local time there, and its end and
 * deadline keep their wall time and offset in days. Re-plans in `zone`, the user's.
 */
export function rescheduleToDay(row: TaskTemporal, newDay: LocalDate, zone: Zone): TaskTemporal {
    if (row.scheduledStart) {
        const oldDay = dayOf(row.scheduledStart, zone);
        const shift = daysBetween(oldDay, newDay);
        return {
            dueDate: row.dueDate ? addDays(row.dueDate, shift) : null,
            endDate: null,
            scheduledStart: atLocal(newDay, wallTimeOf(row.scheduledStart, zone), zone),
            scheduledEnd: row.scheduledEnd ? atLocal(addDays(dayOf(row.scheduledEnd, zone), shift), wallTimeOf(row.scheduledEnd, zone), zone) : null,
            zone,
        };
    }
    const shift = row.dueDate ? daysBetween(row.dueDate, newDay) : 0;
    return { dueDate: newDay, endDate: row.endDate ? addDays(row.endDate, shift) : null, scheduledStart: null, scheduledEnd: null, zone: null };
}

/** "Hide until" is a day. time-legacy: an old client's instant (local midnight) reads as its day. */
export function normalizeHiddenUntil(value: string | null | undefined, zone: Zone, onLegacy: (field: string) => void = () => {}): LocalDate | null {
    if (!value) return null;
    if (isLocalDate(value)) return value;
    onLegacy("notBefore");
    return dayOf(value, zone);
}
