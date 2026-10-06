import { atLocal, type Instant, type LocalDate, type WallTime } from "@cadence/domain/time";
import { getUserZone } from "../user-zone";

export const CALENDAR_SLOT_MINUTES = 15;
export const CALENDAR_SLOT_COUNT = (24 * 60) / CALENDAR_SLOT_MINUTES;

export interface CalendarDropPreview {
    kind: "timed" | "allday";
    dateStr: LocalDate;
    startMinutes?: number;
    endMinutes?: number;
    label?: string;
}

export function buildCalendarTimedDropId(dateStr: LocalDate, minutes: number) {
    return `slot-${dateStr}__${minutes}`;
}

export function buildCalendarAllDayDropId(dateStr: LocalDate) {
    return `allday-${dateStr}`;
}

export function parseCalendarTimedDropId(dropId: string) {
    const match = /^slot-(\d{4}-\d{2}-\d{2})__(\d{1,4})$/.exec(dropId);
    if (!match) return null;

    const [, dateStr, rawMinutes] = match;
    const minutes = Number(rawMinutes);

    if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) {
        return null;
    }

    return { dateStr, minutes };
}

/** `HH:MM` for minutes after midnight. */
export function minutesToWallTime(minutes: number): WallTime {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** An hour-slot drop: the slot's day, its minutes, and the instant at that wall time on that day in the user's zone. */
export function getDateFromTimedDropId(dropId: string): { iso: Instant; date: LocalDate; minutes: number } {
    const parsed = parseCalendarTimedDropId(dropId);
    if (!parsed) {
        throw new Error(`Invalid calendar timed drop id: ${dropId}`);
    }

    return {
        iso: atLocal(parsed.dateStr, minutesToWallTime(parsed.minutes), getUserZone()),
        date: parsed.dateStr,
        minutes: parsed.minutes,
    };
}

export function getDropMinutesLabel(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const normalizedHours = hours % 12 || 12;
    if (mins === 0) return `${normalizedHours} ${period}`;
    return `${normalizedHours}:${String(mins).padStart(2, "0")} ${period}`;
}
