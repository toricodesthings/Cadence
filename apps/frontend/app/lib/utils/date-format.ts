import {
    format,
    startOfWeek,
    endOfWeek,
    addDays as dfnsAddDays,
    isSameDay as dfnsIsSameDay,
    getDaysInMonth as dfnsGetDaysInMonth,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    eachDayOfInterval,
    parseISO,
} from "date-fns";

// ─── Core Conversion ─────────────────────────────────────────────────────────

/**
 * Extract `YYYY-MM-DD` from a Date using **local** timezone getters.
 * This is the canonical way to turn a Date into a date-only string.
 * Never use `.toISOString().substring(0,10)` — that extracts the UTC date.
 */
export function toISODate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Parse a date string as **local** midnight, eliminating the off-by-one error
 * that occurs when `new Date("YYYY-MM-DD")` treats the input as UTC midnight.
 *
 * - Date-only strings ("YYYY-MM-DD")  → appends "T00:00:00" so the browser
 *   interprets them in the local timezone.
 * - Strings that already contain a time component are passed through as-is.
 */
export function parseLocalDate(iso: string): Date {
    return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

// ─── Date Arithmetic (re-exported from date-fns) ─────────────────────────────

export function addDays(date: Date, days: number): Date {
    return dfnsAddDays(date, days);
}

export function isSameDay(a: Date, b: Date): boolean {
    return dfnsIsSameDay(a, b);
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Format a date for display: "Thursday, February 26" */
export function formatDateLabel(date: Date): string {
    return format(date, "EEEE, MMMM d");
}

/** Format a time from an ISO string: "9:30 AM" */
export function formatTime(iso: string): string {
    const d = parseLocalDate(iso);
    return format(d, "h:mm a");
}

/** Format a short local-safe date label: "Mar 8" */
export function formatShortDate(iso: string): string {
    return format(parseLocalDate(iso), "MMM d");
}

/** Format a short local-safe date + time label: "Mar 8, 9:30 AM" */
export function formatShortDateTime(iso: string): string {
    return format(parseLocalDate(iso), "MMM d, h:mm a");
}

/** Format a local-safe date span: "Mar 8 - Mar 10" */
export function formatDateSpan(startIso: string, endIso: string): string {
    return `${formatShortDate(startIso)} - ${formatShortDate(endIso)}`;
}

// ─── Week Helpers ────────────────────────────────────────────────────────────

/** Return the Monday of the ISO week containing the given date */
export function getWeekStart(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 1 });
}

/** Return an array of 7 Date objects (Mon–Sun) for the week containing the given date */
export function getWeekDates(date: Date): Date[] {
    const start = getWeekStart(date);
    return eachDayOfInterval({ start, end: dfnsAddDays(start, 6) });
}

// ─── Date Range Builders ─────────────────────────────────────────────────────
//
// These return `YYYY-MM-DD` boundaries, NOT full ISO strings.
// The backend should interpret these as inclusive date boundaries.
// This eliminates the UTC-shift bug where `.toISOString()` converted
// local midnight/11:59PM into a different date in UTC.

/** Build a date range for a full calendar month → `{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}` */
export function getMonthDateRange(year: number, month: number) {
    const start = new Date(year, month, 1);
    const end = endOfMonth(start);
    return {
        start: toISODate(start),
        end: toISODate(end),
    };
}

/** Build a date range for an entire week (Mon–Sun) → `{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}` */
export function getWeekDateRange(date: Date) {
    const start = getWeekStart(date);
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return {
        start: toISODate(start),
        end: toISODate(end),
    };
}

/** Build a date range for a full calendar year → `{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}` */
export function getYearDateRange(year: number) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return {
        start: toISODate(start),
        end: toISODate(end),
    };
}

/** Return start-of-day `YYYY-MM-DD` string for a given date (local timezone) */
export function startOfDay(date: Date): string {
    return toISODate(date);
}

/** Return end-of-day `YYYY-MM-DD` string for a given date (local timezone) */
export function endOfDay(date: Date): string {
    return toISODate(date);
}
