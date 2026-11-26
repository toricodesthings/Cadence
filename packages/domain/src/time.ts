import { RRule } from "rrule";
import { DomainError } from "./errors";

export type Instant = string;
export type LocalDate = string;
export type WallTime = string;
export type Zone = string;

export type WeekStart = "Sunday" | "Monday" | "Saturday";

const MIN = 60_000;
const DAY_MS = 86_400_000;

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

function offsetMinutes(ms: number, zone: Zone): number {
    const p = wallParts(ms, zone);
    const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((wallAsUtc - Math.floor(ms / 1000) * 1000) / MIN);
}

const toMs = (instant: Instant | Date) => (typeof instant === "string" ? Date.parse(instant) : instant.getTime());
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function isLocalDate(value: unknown): value is LocalDate {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isWallTime(value: unknown): value is WallTime {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function dayOf(instant: Instant | Date, zone: Zone): LocalDate {
    const p = wallParts(toMs(instant), zone);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayIn(zone: Zone, now: Date = new Date()): LocalDate {
    return dayOf(now, zone);
}

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

export function atLocal(day: LocalDate, time: WallTime, zone: Zone): Instant {
    const wall = wallMs(day, time);
    const before = offsetMinutes(wall - DAY_MS, zone);
    const after = offsetMinutes(wall + DAY_MS, zone);
    const valid = [...new Set([before, after])]
        .map((off) => wall - off * MIN)
        .filter((t) => offsetMinutes(t, zone) === (wall - t) / MIN);
    const ms = valid.length ? Math.min(...valid) : wall - before * MIN;
    return new Date(ms).toISOString();
}

export function startOfDay(day: LocalDate, zone: Zone): Instant {
    return atLocal(day, "00:00", zone);
}

export function endOfDay(day: LocalDate, zone: Zone): Instant {
    return new Date(Date.parse(startOfDay(addDays(day, 1), zone)) - 1).toISOString();
}

export function toZonedIso(instant: Instant | Date, zone: Zone): string {
    const ms = toMs(instant);
    const p = wallParts(ms, zone);
    const off = offsetMinutes(ms, zone);
    const abs = Math.abs(off);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${off < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function addDays(day: LocalDate, days: number): LocalDate {
    const { y, m, d } = dayParts(day);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
    return Math.round((wallMs(to, "00:00") - wallMs(from, "00:00")) / DAY_MS);
}

export function weekdayOf(day: LocalDate): number {
    const { y, m, d } = dayParts(day);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEK_START_INDEX: Record<WeekStart, 0 | 1 | 6> = { Sunday: 0, Monday: 1, Saturday: 6 };

export function weekRange(day: LocalDate, weekStart: WeekStart = "Sunday"): { start: LocalDate; end: LocalDate } {
    const back = (weekdayOf(day) - WEEK_START_INDEX[weekStart] + 7) % 7;
    const start = addDays(day, -back);
    return { start, end: addDays(start, 6) };
}

export function monthRange(day: LocalDate): { start: LocalDate; end: LocalDate } {
    const { y, m } = dayParts(day);
    return { start: `${pad(y, 4)}-${pad(m)}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

export function formatInZone(
    value: Instant | LocalDate | Date,
    zone: Zone,
    options: Intl.DateTimeFormatOptions,
    locale = "en-US",
): string {
    const day = typeof value === "string" && isLocalDate(value);
    const timeZone = day ? "UTC" : zone;
    const format = formatter(`${locale}|${timeZone}|${JSON.stringify(options)}`, locale, { ...options, timeZone });
    return format.format(
        day ? new Date(wallMs(value as LocalDate, "12:00")) : typeof value === "string" ? new Date(value) : value,
    );
}

export const floatingStart = (day: LocalDate): Date => new Date(wallMs(day, "00:00"));
export const floatingEnd = (day: LocalDate): Date => new Date(wallMs(day, "00:00") + DAY_MS - 1);
export const floatingDay = (date: Date): LocalDate => date.toISOString().slice(0, 10);

export type SeriesStart = { day: LocalDate } | { instant: Instant; end?: Instant | null };

export interface SeriesOccurrence {
    day: LocalDate;
    start: Instant | null;
    end: Instant | null;
}

const UNTIL = /(^|;)UNTIL=([^;]+)/i;

function splitUntil(rule: string, zone: Zone): { rule: string; until: LocalDate | null | undefined } {
    const match = UNTIL.exec(rule);
    if (!match) return { rule, until: null };
    const raw = match[2];
    const date = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    let until: LocalDate | undefined = date ? `${date[1]}-${date[2]}-${date[3]}` : undefined;
    if (!until) {
        const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw);
        if (full)
            until = dayOf(
                `${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}${raw.endsWith("Z") ? "Z" : ""}`,
                zone,
            );
    }
    return { rule: rule.replace(UNTIL, "").replace(/^;/, ""), until };
}

export function untilOf(rule: string, zone: Zone = "UTC"): LocalDate | null {
    return splitUntil(rule, zone).until ?? null;
}

export function untilClause(day: LocalDate): string {
    return `UNTIL=${day.replaceAll("-", "")}`;
}

export const MAX_RECURRENCE_DAYS = 36_600;

function invalidRule(): never {
    throw new DomainError(
        "INVALID_RECURRENCE_RULE",
        "Use a daily, weekly, monthly or yearly repeat with valid calendar fields",
    );
}

const SETPOS_MAX: Record<string, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 };
const positiveInt = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= 1;
const signedList = (value: string, max: number, negative = true) =>
    value
        .split(",")
        .every(
            (item) =>
                /^[+-]?\d+$/.test(item) &&
                Number.isSafeInteger(Number(item)) &&
                Number(item) !== 0 &&
                Number(item) >= (negative ? -max : 1) &&
                Number(item) <= max,
        );
const RRULE_FIELDS: Record<string, (value: string, freq: string) => boolean> = {
    FREQ: () => true,
    UNTIL: () => true,
    INTERVAL: positiveInt,
    COUNT: positiveInt,
    BYMONTH: (value) => signedList(value, 12, false),
    BYMONTHDAY: (value) => signedList(value, 31),
    BYYEARDAY: (value) => signedList(value, 366),
    BYSETPOS: (value, freq) =>
        signedList(value, SETPOS_MAX[freq]) && new Set(value.split(",").map(Number)).size === value.split(",").length,
    BYWEEKNO: (value) => signedList(value, 53),
    BYDAY: (value) =>
        value.split(",").every((day) => {
            const match = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(day);
            return match !== null && (!match[1] || signedList(match[1], 53));
        }),
    WKST: (value) => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(value),
};

export function parseRecurrenceRule(rule: string, zone: Zone = "UTC") {
    if (rule.length > 500) invalidRule();
    const normalized = rule
        .trim()
        .replace(/^RRULE:/i, "")
        .toUpperCase();
    const fields = new Map<string, string>();
    for (const part of normalized.split(";")) {
        const match = /^([A-Z]+)=([A-Z0-9,+-]+)$/.exec(part);
        if (!match) invalidRule();
        const key = match[1] === "BYWEEKDAY" ? "BYDAY" : match[1];
        if (fields.has(key)) invalidRule();
        fields.set(key, match[2]);
    }
    const freq = fields.get("FREQ") ?? "";
    if (!Object.hasOwn(SETPOS_MAX, freq)) invalidRule();
    for (const [key, value] of fields) {
        if (!Object.hasOwn(RRULE_FIELDS, key) || !RRULE_FIELDS[key](value, freq)) invalidRule();
    }
    try {
        const { rule: bare, until } = splitUntil([...fields].map(([key, value]) => `${key}=${value}`).join(";"), zone);
        if (until === undefined || (until !== null && !isLocalDate(until))) invalidRule();
        return { ...RRule.parseString(bare), ...(until ? { until: floatingEnd(until) } : {}) };
    } catch {
        return invalidRule();
    }
}

export function isValidRule(rule: string, zone: Zone = "UTC"): boolean {
    try {
        parseRecurrenceRule(rule, zone);
        return true;
    } catch {
        return false;
    }
}

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
    const spanMs = endInstant
        ? Math.max(0, wallMs(dayOf(endInstant, zone), wallTimeOf(endInstant, zone)) - wallMs(startDay, startWall))
        : 0;

    const options = parseRecurrenceRule(args.rule, zone);
    const until = options.until ? floatingDay(options.until) : null;
    const last = until && until < range.to ? until : range.to;
    if (last < range.from || last < startDay) return [];
    const first = startDay < range.from ? startDay : range.from;
    if (![first, startDay, last].every(isLocalDate) || daysBetween(first, last) >= MAX_RECURRENCE_DAYS) {
        throw new DomainError(
            "INVALID_RECURRENCE_RULE",
            "Repeat history or date range is too long (maximum 36,600 days)",
        );
    }

    const parsed = new RRule({ ...options, dtstart: new Date(wallMs(startDay, startWall)) }, true);
    const floating = parsed.between(floatingStart(range.from), floatingEnd(last), true, (_date, index) => {
        if (index >= MAX_RECURRENCE_DAYS)
            throw new DomainError("INVALID_RECURRENCE_RULE", "This repeat produces too many occurrences");
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

export function nextOccurrence(
    args: Omit<Parameters<typeof expandSeries>[0], "range"> & { from: LocalDate },
): SeriesOccurrence | null {
    for (let i = 0; i < 4; i++) {
        const from = addDays(args.from, i * 183);
        const hit = expandSeries({ ...args, range: { from, to: addDays(from, 182) } })[0];
        if (hit) return hit;
    }
    return null;
}
