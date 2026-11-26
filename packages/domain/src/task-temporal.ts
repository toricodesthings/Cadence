import { DomainError } from "./errors";
import {
    addDays,
    atLocal,
    dayOf,
    daysBetween,
    isLocalDate,
    isZone,
    wallTimeOf,
    type Instant,
    type LocalDate,
    type Zone,
} from "./time";

export interface TaskTemporalFields {
    dueDate?: string | null;
    endDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    zone?: string | null;
}

export interface TaskTemporal {
    dueDate: LocalDate | null;
    endDate: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    zone: Zone | null;
}

export type TaskReadShape = "unscheduled" | "day" | "days" | "timed";

export function classifyTaskReadShape(
    fields: Pick<TaskTemporal, "dueDate" | "endDate" | "scheduledStart">,
): TaskReadShape {
    if (fields.scheduledStart) return "timed";
    if (fields.dueDate && fields.endDate) return "days";
    return fields.dueDate ? "day" : "unscheduled";
}

export function hasTaskTemporalMutation(fields: Partial<TaskTemporalFields>) {
    return ["dueDate", "endDate", "scheduledStart", "scheduledEnd", "zone"].some((key) => key in fields);
}

function assertInstant(value: string, field: string) {
    if (isLocalDate(value) || !Number.isFinite(Date.parse(value))) {
        throw new DomainError("INVALID_TASK_SCHEDULE", `${field} must be a date and time with an offset`);
    }
}

function assertDay(value: string | null | undefined, field: string): LocalDate | null {
    if (!value) return null;
    if (!isLocalDate(value)) throw new DomainError("INVALID_TASK_SCHEDULE", `${field} must be a day (YYYY-MM-DD)`);
    return value;
}

function timedTemporal(
    start: string,
    end: string | null,
    { dueDate, endDate, zone }: { dueDate: LocalDate | null; endDate: LocalDate | null; zone: string },
): TaskTemporal {
    assertInstant(start, "scheduledStart");
    if (end) {
        assertInstant(end, "scheduledEnd");
        if (Date.parse(end) < Date.parse(start))
            throw new DomainError("INVALID_TASK_SCHEDULE", "scheduledEnd must not be earlier than scheduledStart");
    }
    if (endDate) throw new DomainError("INVALID_TASK_SCHEDULE", "A timed task has no endDate; use scheduledEnd");
    if (!isZone(zone)) throw new DomainError("INVALID_TASK_SCHEDULE", "zone must be an IANA time zone");
    return { dueDate, endDate: null, scheduledStart: start, scheduledEnd: end, zone };
}

export function normalizeTaskTemporalFields(fields: TaskTemporalFields, zone: Zone): TaskTemporal {
    if (!isZone(zone)) throw new DomainError("INVALID_TASK_SCHEDULE", "A time zone is required");
    const start = fields.scheduledStart || null;
    const end = fields.scheduledEnd || null;
    const dueDate = assertDay(fields.dueDate, "dueDate");
    const endDate = assertDay(fields.endDate, "endDate");

    if (start) return timedTemporal(start, end, { dueDate, endDate, zone: fields.zone ?? zone });
    if (end) throw new DomainError("INVALID_TASK_SCHEDULE", "scheduledEnd needs a scheduledStart");

    if (!dueDate) {
        if (endDate) throw new DomainError("INVALID_TASK_SCHEDULE", "All-day tasks require a dueDate");
        return { dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null };
    }
    if (endDate && endDate < dueDate)
        throw new DomainError("INVALID_TASK_SCHEDULE", "endDate must not be earlier than dueDate");
    return { dueDate, endDate, scheduledStart: null, scheduledEnd: null, zone: null };
}

export function rescheduleToDay(row: TaskTemporal, newDay: LocalDate, zone: Zone): TaskTemporal {
    if (row.scheduledStart) {
        const oldDay = dayOf(row.scheduledStart, zone);
        const shift = daysBetween(oldDay, newDay);
        return {
            dueDate: row.dueDate,
            endDate: null,
            scheduledStart: atLocal(newDay, wallTimeOf(row.scheduledStart, zone), zone),
            scheduledEnd: row.scheduledEnd
                ? atLocal(addDays(dayOf(row.scheduledEnd, zone), shift), wallTimeOf(row.scheduledEnd, zone), zone)
                : null,
            zone,
        };
    }
    const shift = row.dueDate ? daysBetween(row.dueDate, newDay) : 0;
    return {
        dueDate: newDay,
        endDate: row.endDate ? addDays(row.endDate, shift) : null,
        scheduledStart: null,
        scheduledEnd: null,
        zone: null,
    };
}

export function normalizeHiddenUntil(value: string | null | undefined): LocalDate | null {
    return assertDay(value, "notBefore");
}
