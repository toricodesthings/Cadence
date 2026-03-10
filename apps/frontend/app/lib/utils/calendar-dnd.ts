import { toISODate } from "./date-format";

export const CALENDAR_SLOT_MINUTES = 30;
export const CALENDAR_SLOT_COUNT = (24 * 60) / CALENDAR_SLOT_MINUTES;

export interface CalendarDropPreview {
    kind: "timed" | "allday";
    dateStr: string;
    startMinutes?: number;
    endMinutes?: number;
    label?: string;
}

export function buildCalendarTimedDropId(dateStr: string, minutes: number) {
    return `slot-${dateStr}__${minutes}`;
}

export function buildCalendarAllDayDropId(dateStr: string) {
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

export function getDateFromTimedDropId(dropId: string) {
    const parsed = parseCalendarTimedDropId(dropId);
    if (!parsed) {
        throw new Error(`Invalid calendar timed drop id: ${dropId}`);
    }

    const [year, month, day] = parsed.dateStr.split("-").map(Number);
    const hours = Math.floor(parsed.minutes / 60);
    const mins = parsed.minutes % 60;
    const iso = new Date(year, month - 1, day, hours, mins, 0, 0).toISOString();

    return {
        iso,
        date: toISODate(new Date(year, month - 1, day)),
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
