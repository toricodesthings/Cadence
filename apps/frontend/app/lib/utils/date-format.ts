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

// ─── Format Configuration ────────────────────────────────────────────────────

type TimeDisplay = "12h" | "24h";
type DateStyle = "mdy" | "dmy" | "ymd";

interface DateFormatConfig {
    timeDisplay: TimeDisplay;
    dateStyle: DateStyle;
    /** 0 = Sunday, 1 = Monday, 6 = Saturday */
    weekStartsOn: 0 | 1 | 6;
}

let _config: DateFormatConfig = {
    timeDisplay: "12h",
    dateStyle: "mdy",
    weekStartsOn: 1,
};

/** Set the global date format configuration. Call from a sync hook. */
export function setDateFormatConfig(config: DateFormatConfig) {
    _config = config;
}

/** Get the current date format configuration. */
export function getDateFormatConfig(): Readonly<DateFormatConfig> {
    return _config;
}

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

/** 
 * Takes a date-only string (YYYY-MM-DD) and an original ISO string with time,
 * and constructs a new ISO string preserving the local hour/minute of the original.
 */
export function preserveLocalTime(datePart: string, originalIso: string): string {
    const oldLocal = new Date(originalIso);
    const lh = String(oldLocal.getHours()).padStart(2, "0");
    const lm = String(oldLocal.getMinutes()).padStart(2, "0");
    return new Date(`${datePart}T${lh}:${lm}:00`).toISOString();
}

/**
 * Extract the YYYY-MM-DD date for a task's effective timestamp.
 * For all-day tasks, extracts the UTC date portion from the stored ISO
 * string to avoid timezone off-by-one (dueDate is stored as UTC midnight).
 * For timed tasks, uses local timezone for correct local-day positioning.
 */
export function getEffectiveTaskDate(dateStr: string, isAllDay: boolean): string {
    if (isAllDay && dateStr.length > 10) {
        return dateStr.substring(0, 10);
    }
    return toISODate(parseLocalDate(dateStr));
}

/**
 * Parse a task's effective timestamp into a Date for calendar positioning.
 * For all-day tasks, re-interprets the UTC date as local midnight to avoid
 * timezone off-by-one. For timed tasks, parses as-is.
 */
export function parseEffectiveTaskDate(dateStr: string, isAllDay: boolean): Date {
    if (isAllDay && dateStr.length > 10) {
        return new Date(`${dateStr.substring(0, 10)}T00:00:00`);
    }
    return parseLocalDate(dateStr);
}

// ─── Date Arithmetic (re-exported from date-fns) ─────────────────────────────

export function addDays(date: Date, days: number): Date {
    return dfnsAddDays(date, days);
}

export function isSameDay(a: Date, b: Date): boolean {
    return dfnsIsSameDay(a, b);
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Format a date for display, e.g. "Thursday, February 26" or "Thursday, 26 February" */
export function formatDateLabel(date: Date): string {
    return _config.dateStyle === "dmy"
        ? format(date, "EEEE, d MMMM")
        : format(date, "EEEE, MMMM d");
}

/** Format a time from an ISO string: "9:30 AM" (12h) or "09:30" (24h) */
export function formatTime(iso: string): string {
    const d = parseLocalDate(iso);
    return format(d, _config.timeDisplay === "24h" ? "HH:mm" : "h:mm a");
}

/** Format a short local-safe date label: "Mar 8" (mdy/ymd) or "8 Mar" (dmy) */
export function formatShortDate(iso: string): string {
    return format(
        parseLocalDate(iso),
        _config.dateStyle === "dmy" ? "d MMM" : "MMM d",
    );
}

/** Format a short local-safe date + time label: "Mar 8, 9:30 AM" */
export function formatShortDateTime(iso: string): string {
    const datePart = _config.dateStyle === "dmy" ? "d MMM" : "MMM d";
    const timePart = _config.timeDisplay === "24h" ? "HH:mm" : "h:mm a";
    return format(parseLocalDate(iso), `${datePart}, ${timePart}`);
}

/** Format a local-safe date span: "Mar 8 - Mar 10" */
export function formatDateSpan(startIso: string, endIso: string): string {
    return `${formatShortDate(startIso)} - ${formatShortDate(endIso)}`;
}

// ─── Week Helpers ────────────────────────────────────────────────────────────

/** Return the start of the week containing the given date, respecting settings */
export function getWeekStart(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: _config.weekStartsOn });
}

/** Return an array of 7 Date objects for the week containing the given date */
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

/** Build a date range for an entire week → `{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}` */
export function getWeekDateRange(date: Date) {
    const start = getWeekStart(date);
    const end = endOfWeek(date, { weekStartsOn: _config.weekStartsOn });
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
