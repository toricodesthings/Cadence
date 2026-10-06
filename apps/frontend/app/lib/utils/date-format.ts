/**
 * Date and time display, and the calendar-grid helpers. Formatting only: days are LocalDates
 * (`YYYY-MM-DD`, as the API sends them), instants are converted by `@cadence/domain/time` in the
 * user's zone (`getUserZone()`), and every label goes through `formatInZone`. Never use `Date`
 * local getters, slicing or `toISOString()` for a day (scripts/check-time.mjs enforces it).
 */
import {
    addDays,
    atLocal,
    dayOf,
    daysBetween,
    formatInZone,
    isLocalDate,
    monthRange,
    WEEK_START_INDEX,
    weekRange,
    weekdayOf,
    wallTimeOf,
    type Instant,
    type LocalDate,
    type WallTime,
} from "@cadence/domain/time";
import type { NlpClock } from "@cadence/nlp/core";
import { getUserZone, today } from "./user-zone";

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

const WEEK_START_NAME = { 0: "Sunday", 1: "Monday", 6: "Saturday" } as const;
const dmy = () => _config.dateStyle === "dmy";
// Intl writes a narrow no-break space before AM/PM; labels and tests use a plain one.
const plain = (text: string) => text.replace(/[  ]/g, " ");
const format = (value: Instant | LocalDate, options: Intl.DateTimeFormatOptions, locale = "en-US") =>
    plain(formatInZone(value, getUserZone(), options, locale));

// ─── Days and instants ───────────────────────────────────────────────────────

/** The user's day an instant falls on. */
export const dayOfInstant = (instant: Instant): LocalDate => dayOf(instant, getUserZone());

/** The day a value names: a LocalDate as is, an instant as the user's day. */
export const toDay = (value: Instant | LocalDate): LocalDate => (isLocalDate(value) ? value : dayOfInstant(value));

/** `HH:mm` (the `TimePicker` value format) an instant shows in the user's zone. */
export const toTimeValue = (instant: Instant): WallTime => wallTimeOf(instant, getUserZone());

/** The instant at `time` on `day` in the user's zone (`day` may also be an instant: its user's day is used). */
export const fromTimeValue = (day: LocalDate | Instant, time: WallTime): Instant => atLocal(toDay(day), time, getUserZone());

/** The end instant of a block that starts at `start` and ends at wall time `time`: on `day`, or the next day when that is not after the start (overnight). */
export function blockEnd(day: LocalDate, start: Instant, time: WallTime): Instant {
    const sameDay = fromTimeValue(day, time);
    return Date.parse(sameDay) > Date.parse(start) ? sameDay : fromTimeValue(addDays(day, 1), time);
}

/**
 * A calendar widget (react-day-picker, native inputs) speaks `Date`. This pair is the only crossing:
 * a LocalDate shows as that day at device-local midnight, and the picked `Date` reads back by its
 * y/m/d. Both are picker plumbing, never day logic.
 */
export const pickerDate = (day: LocalDate): Date => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
};
export const fromPickerDate = (date: Date): LocalDate =>
    `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; // time-ok: a picked Date's y/m/d

// ─── Formatting ──────────────────────────────────────────────────────────────

/** "Thursday, February 26" or "Thursday, 26 February" (dmy). */
export function formatDateLabel(day: LocalDate): string {
    const weekday = format(day, { weekday: "long" });
    const month = format(day, { month: "long" });
    const date = format(day, { day: "numeric" });
    return dmy() ? `${weekday}, ${date} ${month}` : `${weekday}, ${month} ${date}`;
}

/** A time from an instant: "9:30 AM" (12h) or "09:30" (24h). */
export function formatTime(instant: Instant): string {
    return _config.timeDisplay === "24h"
        ? format(instant, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        : format(instant, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "9:30 AM" / "09:30" from a wall time (a routine's time of day: no day or zone involved). */
export function formatWallTime(time: WallTime): string {
    const [h, m] = time.split(":").map(Number);
    if (_config.timeDisplay === "24h") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** A short date: "Mar 8" (mdy/ymd) or "8 Mar" (dmy). Takes a day, or an instant (shown as the user's day). */
export function formatShortDate(value: Instant | LocalDate): string {
    return format(toDay(value), { month: "short", day: "numeric" }, dmy() ? "en-GB" : "en-US");
}

/** Short date + time: "Mar 8, 9:30 AM". */
export function formatShortDateTime(instant: Instant): string {
    return `${format(instant, { month: "short", day: "numeric" }, dmy() ? "en-GB" : "en-US")}, ${formatTime(instant)}`;
}

/** Weekday + short date from a day: "Thu, Mar 8" or "Thu 8 Mar" (dmy); `year` appends the year. */
export function formatShortDateLabel(day: LocalDate, { year = false }: { year?: boolean } = {}): string {
    return format(day, { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }, dmy() ? "en-GB" : "en-US");
}

/** "Mar 8 - Mar 10" from two days. */
export function formatDateSpan(start: LocalDate, end: LocalDate): string {
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

/** "Thursday" for a day. */
export const formatWeekdayLong = (day: LocalDate): string => format(day, { weekday: "long" });

/** "T" for a day (calendar tile headers). */
export const formatWeekdayNarrow = (day: LocalDate): string => format(day, { weekday: "narrow" });

/** The month's name for a day: "October". */
export const formatMonthName = (day: LocalDate): string => format(day, { month: "long" });

/** "October 2026" for a day. */
export const formatMonthYear = (day: LocalDate): string => format(day, { month: "long", year: "numeric" });

/** "HH:mm" shifted by `delta` minutes, wrapping past midnight. */
export function addMinutesToTime(time: string, delta: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Minutes from one "HH:mm" to the next, crossing midnight when `end` is earlier. */
export function minutesBetweenTimes(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? diff : diff + 1440;
}

/** Compact age: "just now", "5 m", "3 h", "2 d", "4 mo" — plus `suffix` (e.g. " ago"). */
export function relativeTime(iso: Instant, { suffix = "" }: { suffix?: string } = {}): string {
    const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));

    if (diffSec < 60) return "just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} m${suffix}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h${suffix}`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} d${suffix}`;
    return `${Math.floor(days / 30)} mo${suffix}`;
}

// ─── Week and month grids (arrays of LocalDates) ─────────────────────────────

export { WEEK_START_INDEX };

/** The first day of the week containing `day`, respecting settings. */
export function getWeekStart(day: LocalDate, weekStartsOn: 0 | 1 | 6 = _config.weekStartsOn): LocalDate {
    return weekRange(day, WEEK_START_NAME[weekStartsOn]).start;
}

/** The seven days of the week containing `day`. */
export function getWeekDays(day: LocalDate, weekStartsOn?: 0 | 1 | 6): LocalDate[] {
    const start = getWeekStart(day, weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Every day of the month containing `day`. */
export function getMonthDays(day: LocalDate): LocalDate[] {
    const { start, end } = monthRange(day);
    return Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => addDays(start, i));
}

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Weekday labels cut to `length` chars ("Mon", "Mo", "M"), starting on `weekStartsOn` (0 = Sunday, 1 = Monday, 6 = Saturday). */
export function weekdayLabels(length: number, weekStartsOn: 0 | 1 | 6 = 1): string[] {
    const shift = (weekStartsOn + 6) % 7; // WEEKDAY_NAMES starts on Monday
    return [...WEEKDAY_NAMES.slice(shift), ...WEEKDAY_NAMES.slice(0, shift)].map((d) => d.slice(0, length));
}

/** Days in a month (`month` is 0-based). */
export function getDaysInMonth(year: number, month: number): number {
    return Number(monthRange(isoMonthStart(year, month)).end.slice(8));
}

/** Blank cells before day 1 in a month grid whose weeks start on `weekStartsOn` (`month` is 0-based). */
export function getFirstDayOfWeek(year: number, month: number, weekStartsOn: 0 | 1 | 6 = 1): number {
    return (weekdayOf(isoMonthStart(year, month)) - weekStartsOn + 7) % 7;
}

/** The first day of a month (`month` is 0-based). */
export function isoMonthStart(year: number, month: number): LocalDate {
    return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`;
}

/** The day with `day` of a 0-based month and year (no overflow: caller passes a real day). */
export function isoDay(year: number, month: number, day: number): LocalDate {
    return `${isoMonthStart(year, month).slice(0, 8)}${String(day).padStart(2, "0")}`;
}

// ─── Date Range Builders ─────────────────────────────────────────────────────
// Inclusive LocalDate bounds `{ start, end }`; the server turns them into instants in the user's zone.

export const getMonthDateRange = (year: number, month: number) => monthRange(isoMonthStart(year, month));

export const getWeekDateRange = (day: LocalDate) => weekRange(day, WEEK_START_NAME[_config.weekStartsOn]);

export const getYearDateRange = (year: number) => ({ start: isoDay(year, 0, 1), end: isoDay(year, 11, 31) });

/** A placement destination, in the user's date and time format: "Today", "Tomorrow", "Thu, Mar 8 · 9:30 AM". */
export function placementLabel(value: Instant | LocalDate): string {
    const day = toDay(value);
    const now = today();
    const label = day === now ? "Today"
        : day === addDays(now, 1) ? "Tomorrow"
        : format(day, { weekday: "short", month: "short", day: "numeric" });
    return isLocalDate(value) ? label : `${label} · ${formatTime(value)}`;
}

/** The user's today, time and week start for `@cadence/nlp` (it never reads the machine clock or zone). */
export const nlpClock = (): NlpClock => ({
    today: today(),
    now: wallTimeOf(new Date(), getUserZone()),
    weekStart: WEEK_START_NAME[_config.weekStartsOn],
});
