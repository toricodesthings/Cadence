import {
    addDays,
    atLocal,
    dayOf,
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
import type { SettingsView } from "@cadence/contracts/settings";
import type { DateStyle, NlpClock } from "@cadence/nlp/core";
import { getUserZone, today } from "./user-zone";

type TimeDisplay = SettingsView["dateTime"]["timeDisplay"];

interface DateFormatConfig {
    timeDisplay: TimeDisplay;
    dateStyle: DateStyle;
    weekStartsOn: 0 | 1 | 6;
}

let _config: DateFormatConfig = {
    timeDisplay: "12h",
    dateStyle: "mdy",
    weekStartsOn: 1,
};

export function setDateFormatConfig(config: DateFormatConfig) {
    _config = config;
}

export function getDateFormatConfig(): Readonly<DateFormatConfig> {
    return _config;
}

const WEEK_START_NAME = { 0: "Sunday", 1: "Monday", 6: "Saturday" } as const;
const dmy = () => _config.dateStyle === "dmy";
const plain = (text: string) => text.replace(/[  ]/g, " ");
const format = (value: Instant | LocalDate, options: Intl.DateTimeFormatOptions, locale = "en-US") =>
    plain(formatInZone(value, getUserZone(), options, locale));

export const dayOfInstant = (instant: Instant): LocalDate => dayOf(instant, getUserZone());

export const toDay = (value: Instant | LocalDate): LocalDate => (isLocalDate(value) ? value : dayOfInstant(value));

export const toTimeValue = (instant: Instant): WallTime => wallTimeOf(instant, getUserZone());

export const fromTimeValue = (day: LocalDate | Instant, time: WallTime): Instant =>
    atLocal(toDay(day), time, getUserZone());

export function blockEnd(day: LocalDate, start: Instant, time: WallTime): Instant {
    const sameDay = fromTimeValue(day, time);
    return Date.parse(sameDay) > Date.parse(start) ? sameDay : fromTimeValue(addDays(day, 1), time);
}

export function formatTime(instant: Instant): string {
    return _config.timeDisplay === "24h"
        ? format(instant, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        : format(instant, { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatChipTime(start: Instant, end?: Instant | null): string {
    const [sh, sm] = toTimeValue(start).split(":").map(Number);
    const [eh, em] = end ? toTimeValue(end).split(":").map(Number) : [];
    if (_config.timeDisplay === "24h") {
        const clock = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        return eh === undefined ? clock(sh, sm) : `${clock(sh, sm)} \u2013 ${clock(eh, em)}`;
    }
    const clock = (h: number, m: number) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
    const mer = (h: number) => (h < 12 ? "am" : "pm");
    if (eh === undefined) return `${clock(sh, sm)}${mer(sh)}`;
    return mer(sh) === mer(eh)
        ? `${clock(sh, sm)} \u2013 ${clock(eh, em)}${mer(eh)}`
        : `${clock(sh, sm)}${mer(sh)} \u2013 ${clock(eh, em)}${mer(eh)}`;
}

export function formatWallTime(time: WallTime): string {
    const [h, m] = time.split(":").map(Number);
    if (_config.timeDisplay === "24h") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatShortDate(value: Instant | LocalDate): string {
    return format(toDay(value), { month: "short", day: "numeric" }, dmy() ? "en-GB" : "en-US");
}

export function formatShortDateTime(instant: Instant): string {
    return `${format(instant, { month: "short", day: "numeric" }, dmy() ? "en-GB" : "en-US")}, ${formatTime(instant)}`;
}

export function formatShortDateLabel(day: LocalDate, { year = false }: { year?: boolean } = {}): string {
    return format(
        day,
        { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) },
        dmy() ? "en-GB" : "en-US",
    );
}

export function formatDateSpan(start: LocalDate, end: LocalDate): string {
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

export const formatWeekdayLong = (day: LocalDate): string => format(day, { weekday: "long" });

export const formatWeekdayShort = (day: LocalDate): string => format(day, { weekday: "short" });

export const formatWeekdayNarrow = (day: LocalDate): string => format(day, { weekday: "narrow" });

export const formatMonthName = (day: LocalDate): string => format(day, { month: "long" });

export const formatMonthYear = (day: LocalDate): string => format(day, { month: "long", year: "numeric" });

export function addMinutesToTime(time: string, delta: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function minutesBetweenTimes(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? diff : diff + 1440;
}

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

export { WEEK_START_INDEX };

export function getWeekStart(day: LocalDate, weekStartsOn: 0 | 1 | 6 = _config.weekStartsOn): LocalDate {
    return weekRange(day, WEEK_START_NAME[weekStartsOn]).start;
}

export function getWeekDays(day: LocalDate, weekStartsOn?: 0 | 1 | 6): LocalDate[] {
    const start = getWeekStart(day, weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekdayLabels(length: number, weekStartsOn: 0 | 1 | 6 = 1): string[] {
    const shift = (weekStartsOn + 6) % 7;
    return [...WEEKDAY_NAMES.slice(shift), ...WEEKDAY_NAMES.slice(0, shift)].map((d) => d.slice(0, length));
}

export function getDaysInMonth(year: number, month: number): number {
    return Number(monthRange(isoMonthStart(year, month)).end.slice(8));
}

export function getFirstDayOfWeek(year: number, month: number, weekStartsOn: 0 | 1 | 6 = 1): number {
    return (weekdayOf(isoMonthStart(year, month)) - weekStartsOn + 7) % 7;
}

export function isoMonthStart(year: number, month: number): LocalDate {
    return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`;
}

export function isoDay(year: number, month: number, day: number): LocalDate {
    return `${isoMonthStart(year, month).slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export const getMonthDateRange = (year: number, month: number) => monthRange(isoMonthStart(year, month));

export const getWeekDateRange = (day: LocalDate, weekStartsOn: 0 | 1 | 6 = _config.weekStartsOn) =>
    weekRange(day, WEEK_START_NAME[weekStartsOn]);

export const getYearDateRange = (year: number) => ({ start: isoDay(year, 0, 1), end: isoDay(year, 11, 31) });

export function placementLabel(value: Instant | LocalDate): string {
    const day = toDay(value);
    const now = today();
    const label =
        day === now
            ? "Today"
            : day === addDays(now, 1)
              ? "Tomorrow"
              : format(day, { weekday: "short", month: "short", day: "numeric" });
    return isLocalDate(value) ? label : `${label} · ${formatTime(value)}`;
}

export function placementReceipt(value: Instant | LocalDate, listName?: string | null): string {
    const day = toDay(value);
    const now = today();
    const where = listName ?? (day < now ? "Today" : day > now ? "Upcoming" : null);
    return where ? `${placementLabel(value)} · in ${where}` : placementLabel(value);
}

export const nlpClock = (): NlpClock => ({
    today: today(),
    now: wallTimeOf(new Date(), getUserZone()),
    weekStart: WEEK_START_NAME[_config.weekStartsOn],
});
