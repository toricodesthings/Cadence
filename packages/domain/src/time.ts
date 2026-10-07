// The one place that converts between Instant, LocalDate, WallTime and Zone.
// Pure, `Intl` only, shaped like `Temporal` so it can be swapped for it later.
import { RRule } from "rrule";
import { DomainError } from "./errors";

/** One exact moment: ISO 8601 (this module writes `Z`; offsets are accepted). */
export type Instant = string;
/** A calendar day, `YYYY-MM-DD`, with no time and no zone. */
export type LocalDate = string;
/** A clock time, `HH:MM`, always read with the day and zone it belongs to. */
export type WallTime = string;
/** An IANA zone name, e.g. `America/Toronto`. Never an offset, never "local". */
export type Zone = string;

export type WeekStart = "Sunday" | "Monday" | "Saturday";

const MIN = 60_000;
const DAY_MS = 86_400_000;

// ── Zones ──

export { isZone } from "@cadence/contracts/common";

const formats = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, locale: string, options: Intl.DateTimeFormatOptions) {
    let format = formats.get(key);
    if (!format) formats.set(key, (format = new Intl.DateTimeFormat(locale, options)));
    return format;
}

function wallParts(ms: number, zone: Zone) {
    const format = formatter(zone, "en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const parts: Record<string, number> = {};
    for (const p of format.formatToParts(new Date(ms))) if (p.type !== "literal") parts[p.type] = Number(p.value);
    return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Minutes east of UTC that `zone` is at `ms` (DST-aware). */
function offsetMinutes(ms: number, zone: Zone): number {
    const p = wallParts(ms, zone);
    const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((wallAsUtc - Math.floor(ms / 1000) * 1000) / MIN);
}

const toMs = (instant: Instant | Date) => (typeof instant === "string" ? Date.parse(instant) : instant.getTime());
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// ── Today, days and clocks ──

export function isLocalDate(value: unknown): value is LocalDate {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isWallTime(value: unknown): value is WallTime {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The day an instant falls on in `zone`. */
export function dayOf(instant: Instant | Date, zone: Zone): LocalDate {
    const p = wallParts(toMs(instant), zone);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** The user's today. */
export function todayIn(zone: Zone, now: Date = new Date()): LocalDate {
    return dayOf(now, zone);
}

/** The clock time an instant shows in `zone`. */
export function wallTimeOf(instant: Instant | Date, zone: Zone): WallTime {
    const p = wallParts(toMs(instant), zone);
    return `${pad(p.hour)}:${pad(p.minute)}`;
}

function dayParts(day: LocalDate) {
    const [y, m, d] = day.split("-").map(Number);
    return { y, m, d };
}

function wallMs(day: LocalDate, time: WallTime) {
    const { y, m, d } = dayParts(day);
    const [hh, mm] = time.split(":").map(Number);
    return Date.UTC(y, m - 1, d, hh, mm);
}

/**
 * A wall time on a day, as an instant. A time skipped by a DST jump moves forward
 * (02:30 on spring-forward → 03:30); a time that happens twice takes the earlier.
 */
export function atLocal(day: LocalDate, time: WallTime, zone: Zone): Instant {
    const wall = wallMs(day, time);
    const before = offsetMinutes(wall - DAY_MS, zone);
    const after = offsetMinutes(wall + DAY_MS, zone);
    const valid = [...new Set([before, after])].map((off) => wall - off * MIN).filter((t) => offsetMinutes(t, zone) === (wall - t) / MIN);
    // No valid candidate: the time is in a gap; the pre-jump offset lands it one gap later.
    const ms = valid.length ? Math.min(...valid) : wall - before * MIN;
    return new Date(ms).toISOString();
}

/** The instant a local day begins. */
export function startOfDay(day: LocalDate, zone: Zone): Instant {
    return atLocal(day, "00:00", zone);
}

/** The last millisecond of a local day. */
export function endOfDay(day: LocalDate, zone: Zone): Instant {
    return new Date(Date.parse(startOfDay(addDays(day, 1), zone)) - 1).toISOString();
}

/** `2026-10-05T14:35:00-04:00`: the instant as the user's wall clock with its offset. */
export function toZonedIso(instant: Instant | Date, zone: Zone): string {
    const ms = toMs(instant);
    const p = wallParts(ms, zone);
    const off = offsetMinutes(ms, zone);
    const abs = Math.abs(off);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${off < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// ── LocalDate arithmetic (no zone involved) ──

export function addDays(day: LocalDate, days: number): LocalDate {
    const { y, m, d } = dayParts(day);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
    return Math.round((wallMs(to, "00:00") - wallMs(from, "00:00")) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: LocalDate): number {
    const { y, m, d } = dayParts(day);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The weekday index (0 = Sunday) a week starting on each name begins at. */
export const WEEK_START_INDEX: Record<WeekStart, 0 | 1 | 6> = { Sunday: 0, Monday: 1, Saturday: 6 };

/** The seven days (first, last) of the week containing `day`. */
export function weekRange(day: LocalDate, weekStart: WeekStart = "Sunday"): { start: LocalDate; end: LocalDate } {
    const back = (weekdayOf(day) - WEEK_START_INDEX[weekStart] + 7) % 7;
    const start = addDays(day, -back);
    return { start, end: addDays(start, 6) };
}

/** The first and last day of the month containing `day`. */
export function monthRange(day: LocalDate): { start: LocalDate; end: LocalDate } {
    const { y, m } = dayParts(day);
    return { start: `${pad(y, 4)}-${pad(m)}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

// ── Display ──

/**
 * The only display formatter. An instant is shown in `zone`; a LocalDate is a day
 * with no zone, so it renders as stored (date parts only).
 */
export function formatInZone(value: Instant | LocalDate | Date, zone: Zone, options: Intl.DateTimeFormatOptions, locale = "en-US"): string {
    const day = typeof value === "string" && isLocalDate(value);
    const timeZone = day ? "UTC" : zone;
    const format = formatter(`${locale}|${timeZone}|${JSON.stringify(options)}`, locale, { ...options, timeZone });
    return format.format(day ? new Date(wallMs(value as LocalDate, "12:00")) : typeof value === "string" ? new Date(value) : value);
}

// ── Repeating series ──

/**
 * rrule only speaks `Date`, so a LocalDate series runs in a floating UTC frame: a day is the
 * UTC midnight of that date. These three are the only crossings between the frame and LocalDates.
 */
export const floatingStart = (day: LocalDate): Date => new Date(wallMs(day, "00:00"));
export const floatingEnd = (day: LocalDate): Date => new Date(wallMs(day, "00:00") + DAY_MS - 1);
export const floatingDay = (date: Date): LocalDate => date.toISOString().slice(0, 10);

export type SeriesStart = { day: LocalDate } | { instant: Instant; end?: Instant | null };

export type SeriesOccurrence = { day: LocalDate; start: Instant | null; end: Instant | null };

const UNTIL = /(^|;)UNTIL=([^;]+)/i;

/** The inclusive last day of a rule (`UNTIL=YYYYMMDD`; a legacy `…Z` instant reads in `zone`) and the rule without it. `until` is null with no UNTIL, undefined when it can't be read. */
function splitUntil(rule: string, zone: Zone): { rule: string; until: LocalDate | null | undefined } {
    const match = UNTIL.exec(rule);
    if (!match) return { rule, until: null };
    const raw = match[2];
    const date = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    let until: LocalDate | undefined = date ? `${date[1]}-${date[2]}-${date[3]}` : undefined;
    if (!until) {
        const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw);
        if (full) until = dayOf(`${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}${raw.endsWith("Z") ? "Z" : ""}`, zone);
    }
    return { rule: rule.replace(UNTIL, "").replace(/^;/, ""), until };
}

/** A rule's UNTIL as a LocalDate, or null when it has none or can't be read. */
export function untilOf(rule: string, zone: Zone = "UTC"): LocalDate | null {
    return splitUntil(rule, zone).until ?? null;
}

/** `UNTIL=YYYYMMDD` for a LocalDate. */
export function untilClause(day: LocalDate): string {
    return `UNTIL=${day.replaceAll("-", "")}`;
}

/** Bound the anchor-to-window span and returned occurrences (~100 years). */
export const MAX_RECURRENCE_DAYS = 36_600;

function invalidRule(): never {
    throw new DomainError("INVALID_RECURRENCE_RULE", "Use a daily, weekly, monthly or yearly repeat with valid calendar fields");
}

/**
 * One day-based RRULE, shared by writes and stored-state reads. The series owns
 * its start, time and zone: embedded calendars and subdaily selectors are not
 * part of this contract. Validate before rrule can iterate or build a timeset.
 */
export function parseRecurrenceRule(rule: string, zone: Zone = "UTC") {
    if (rule.length > 500) invalidRule();
    const normalized = rule.trim().replace(/^RRULE:/i, "").toUpperCase();
    const fields = new Map<string, string>();
    for (const part of normalized.split(";")) {
        const match = /^([A-Z]+)=([A-Z0-9,+-]+)$/.exec(part);
        if (!match) invalidRule();
        const key = match[1] === "BYWEEKDAY" ? "BYDAY" : match[1];
        if (fields.has(key)) invalidRule();
        fields.set(key, match[2]);
    }
    if (!/^(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(fields.get("FREQ") ?? "")) invalidRule();
    const signedList = (value: string, max: number, negative = true) => value.split(",").every((item) =>
        /^[+-]?\d+$/.test(item) && Number.isSafeInteger(Number(item)) && Number(item) !== 0 &&
        Number(item) >= (negative ? -max : 1) && Number(item) <= max);
    for (const [key, value] of fields) {
        switch (key) {
            case "FREQ": case "UNTIL": break;
            case "INTERVAL": case "COUNT":
                if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) invalidRule();
                break;
            case "BYMONTH": if (!signedList(value, 12, false)) invalidRule(); break;
            case "BYMONTHDAY": if (!signedList(value, 31)) invalidRule(); break;
            case "BYYEARDAY": if (!signedList(value, 366)) invalidRule(); break;
            case "BYSETPOS": {
                // Positions select days within a period, never a timeset. Bound
                // prefix work too: between's callback only sees in-range dates.
                const max = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[fields.get("FREQ")!]!;
                const positions = value.split(",").map(Number);
                if (!signedList(value, max) || new Set(positions).size !== positions.length) invalidRule();
                break;
            }
            case "BYWEEKNO": if (!signedList(value, 53)) invalidRule(); break;
            case "BYDAY":
                if (!value.split(",").every((day) => {
                    const match = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(day);
                    return match && (!match[1] || signedList(match[1], 53));
                })) invalidRule();
                break;
            case "WKST": if (!/^(MO|TU|WE|TH|FR|SA|SU)$/.test(value)) invalidRule(); break;
            default: invalidRule();
        }
    }
    try {
        const { rule: bare, until } = splitUntil([...fields].map(([key, value]) => `${key}=${value}`).join(";"), zone);
        if (until === undefined || (until !== null && !isLocalDate(until))) invalidRule();
        return { ...RRule.parseString(bare), ...(until ? { until: floatingEnd(until) } : {}) };
    } catch {
        return invalidRule();
    }
}

/** Whether a rule is valid for a single day-based series. */
export function isValidRule(rule: string, zone: Zone = "UTC"): boolean {
    try {
        parseRecurrenceRule(rule, zone);
        return true;
    } catch {
        return false;
    }
}

/**
 * The occurrences of a repeating series on local days `from`…`to` (inclusive).
 * - All-day (`start: { day }`): LocalDates only, no instant is ever produced.
 * - Timed (`start: { instant, end? }`): rrule runs in a floating wall-clock frame (BYDAY
 *   and the time are local), and each occurrence converts back with `atLocal`, so a
 *   2:35 PM class stays 2:35 PM across a DST change. The span from start to end is kept
 *   in wall time.
 * The rule carries no DTSTART or TZID; `UNTIL` is a LocalDate, inclusive.
 */
export function expandSeries(args: {
    rule: string;
    start: SeriesStart;
    zone: Zone;
    range: { from: LocalDate; to: LocalDate };
}): SeriesOccurrence[] {
    const { zone, range } = args;
    const s = args.start;
    const timed = "instant" in s;
    const startDay = "instant" in s ? dayOf(s.instant, zone) : s.day;
    const startWall = "instant" in s ? wallTimeOf(s.instant, zone) : "00:00";
    const endInstant = "instant" in s ? s.end : null;
    const spanMs = endInstant ? Math.max(0, wallMs(dayOf(endInstant, zone), wallTimeOf(endInstant, zone)) - wallMs(startDay, startWall)) : 0;

    const options = parseRecurrenceRule(args.rule, zone);
    const until = options.until ? floatingDay(options.until) : null;
    const last = until && until < range.to ? until : range.to;
    if (last < range.from || last < startDay) return [];
    const first = startDay < range.from ? startDay : range.from;
    if (![first, startDay, last].every(isLocalDate) || daysBetween(first, last) >= MAX_RECURRENCE_DAYS) {
        throw new DomainError("INVALID_RECURRENCE_RULE", "Repeat history or date range is too long (maximum 36,600 days)");
    }

    const parsed = new RRule({ ...options, dtstart: new Date(wallMs(startDay, startWall)) }, true);
    const floating = parsed.between(floatingStart(range.from), floatingEnd(last), true, (_date, index) => {
        if (index >= MAX_RECURRENCE_DAYS) throw new DomainError("INVALID_RECURRENCE_RULE", "This repeat produces too many occurrences");
        return true;
    });
    return floating.map((f) => {
        const day = floatingDay(f);
        if (!timed) return { day, start: null, end: null };
        const end = endInstant ? new Date(f.getTime() + spanMs) : null;
        return {
            day,
            start: atLocal(day, startWall, zone),
            end: end ? atLocal(floatingDay(end), end.toISOString().slice(11, 16), zone) : null,
        };
    });
}

/** The first occurrence on or after `from` (up to ~2 years ahead), or null. Used to anchor a series near a day. */
export function nextOccurrence(args: Omit<Parameters<typeof expandSeries>[0], "range"> & { from: LocalDate }): SeriesOccurrence | null {
    for (let i = 0; i < 4; i++) {
        const from = addDays(args.from, i * 183);
        const hit = expandSeries({ ...args, range: { from, to: addDays(from, 182) } })[0];
        if (hit) return hit;
    }
    return null;
}
