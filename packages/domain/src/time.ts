// The one place that converts between Instant, LocalDate, WallTime and Zone.
// Pure, `Intl` only, shaped like `Temporal` so it can be swapped for it later.
import { rrulestr } from "rrule";

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

const partsFormats = new Map<string, Intl.DateTimeFormat>();

function wallParts(ms: number, zone: Zone) {
    let format = partsFormats.get(zone);
    if (!format) {
        format = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        partsFormats.set(zone, format);
    }
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

/**
 * time-legacy: the day a pre-0.26.3 value meant. A date is itself; an instant at one of the old
 * anchors (00:00, 12:00 or 23:59:59.999 UTC) names its UTC date; any other instant is the day the
 * app showed, in `zone`. The same rules the 0004 migration applies (A and B). Removed with the shim.
 */
export function legacyDay(value: Instant | LocalDate, zone: Zone): LocalDate {
    if (isLocalDate(value)) return value;
    const ms = Date.parse(value);
    const utc = new Date(ms);
    const ofDay = ms - Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    return ofDay === 0 || ofDay === 12 * 3_600_000 || ofDay === DAY_MS - 1 ? utc.toISOString().slice(0, 10) : dayOf(value, zone);
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

/** The user's clock right now. */
export function nowWallTime(zone: Zone, now: Date = new Date()): WallTime {
    return wallTimeOf(now, zone);
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

const WEEK_START_INDEX: Record<WeekStart, number> = { Sunday: 0, Monday: 1, Saturday: 6 };

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

const displayFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * The only display formatter. An instant is shown in `zone`; a LocalDate is a day
 * with no zone, so it renders as stored (date parts only).
 */
export function formatInZone(value: Instant | LocalDate | Date, zone: Zone, options: Intl.DateTimeFormatOptions, locale = "en-US"): string {
    const day = typeof value === "string" && isLocalDate(value);
    const timeZone = day ? "UTC" : zone;
    const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
    let format = displayFormats.get(key);
    if (!format) {
        format = new Intl.DateTimeFormat(locale, { ...options, timeZone });
        displayFormats.set(key, format);
    }
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

/** The inclusive last day of a rule (`UNTIL=YYYYMMDD`; a legacy `…Z` instant reads in `zone`) and the rule without it. */
function splitUntil(rule: string, zone: Zone): { rule: string; until: LocalDate | null } {
    const match = UNTIL.exec(rule);
    if (!match) return { rule, until: null };
    const raw = match[2];
    const date = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    let until: LocalDate | null = date ? `${date[1]}-${date[2]}-${date[3]}` : null;
    if (!until) {
        const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw);
        if (full) until = dayOf(`${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}${raw.endsWith("Z") ? "Z" : ""}`, zone);
    }
    return { rule: rule.replace(UNTIL, "").replace(/^;/, ""), until };
}

/** A rule's UNTIL as a LocalDate, or null when it has none or can't be read. */
export function untilOf(rule: string, zone: Zone = "UTC"): LocalDate | null {
    return splitUntil(rule, zone).until;
}

/** `UNTIL=YYYYMMDD` for a LocalDate. */
export function untilClause(day: LocalDate): string {
    return `UNTIL=${day.replaceAll("-", "")}`;
}

/** Whether a rule parses (an unparseable UNTIL counts as invalid). */
export function isValidRule(rule: string, zone: Zone = "UTC"): boolean {
    try {
        const raw = UNTIL.exec(rule)?.[2];
        const { rule: bare, until } = splitUntil(rule, zone);
        if (raw && !until) return false;
        rrulestr(bare, { dtstart: new Date(Date.UTC(2000, 0, 1)) });
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
    const timed = "instant" in args.start;
    const startDay = timed ? dayOf((args.start as { instant: Instant }).instant, zone) : (args.start as { day: LocalDate }).day;
    const startWall = timed ? wallTimeOf((args.start as { instant: Instant }).instant, zone) : "00:00";
    const endInstant = timed ? (args.start as { end?: Instant | null }).end : null;
    const spanMs = endInstant ? Math.max(0, wallMs(dayOf(endInstant, zone), wallTimeOf(endInstant, zone)) - wallMs(startDay, startWall)) : 0;

    const { rule, until } = splitUntil(args.rule, zone);
    let parsed: ReturnType<typeof rrulestr>;
    try {
        parsed = rrulestr(rule, { dtstart: new Date(wallMs(startDay, startWall)) });
    } catch {
        return [];
    }
    const last = until && until < range.to ? until : range.to;
    if (last < range.from) return [];

    const floating = parsed.between(new Date(wallMs(range.from, "00:00")), new Date(wallMs(last, "00:00") + DAY_MS - 1), true);
    return floating.map((f) => {
        const day = f.toISOString().slice(0, 10);
        if (!timed) return { day, start: null, end: null };
        const end = endInstant ? new Date(f.getTime() + spanMs) : null;
        return {
            day,
            start: atLocal(day, startWall, zone),
            end: end ? atLocal(end.toISOString().slice(0, 10), end.toISOString().slice(11, 16), zone) : null,
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
