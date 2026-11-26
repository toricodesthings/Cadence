import type { TimeOfDay } from "@cadence/contracts/planning";
import { addDays, atLocal, dayOf, todayIn, wallTimeOf, type Instant, type LocalDate, type Zone } from "./time";

export type { TimeOfDay };

export const DEFAULT_DAY_START_HOUR = 7;
export const DEFAULT_DAY_END_HOUR = 22;
const EARLIEST_HOUR = 6;

export interface DayHours {
    timelineStartHour: number;
    dayEndHour?: number;
}

export function dayHoursOf(settings: unknown): Required<DayHours> {
    const cal = (settings as { calendar?: { timelineStartHour?: unknown; dayEndHour?: unknown } } | null)?.calendar;
    return {
        timelineStartHour: typeof cal?.timelineStartHour === "number" ? cal.timelineStartHour : DEFAULT_DAY_START_HOUR,
        dayEndHour: typeof cal?.dayEndHour === "number" ? cal.dayEndHour : DEFAULT_DAY_END_HOUR,
    };
}
export const BUFFER_MINUTES = 15;
const GRID_MINUTES = 15;
const MAX_PROPOSALS = 8;
const MIN = 60_000;

export function timeOfDay(hour: number): TimeOfDay {
    if (hour < 9) return "early";
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    if (hour < 21) return "evening";
    return "late";
}

export const bucketOf = (instant: Instant, zone: Zone): TimeOfDay =>
    timeOfDay(Number(wallTimeOf(instant, zone).slice(0, 2)));

export interface Busy {
    start: Instant;
    end: Instant;
}

export interface FindTimeInput extends DayHours {
    task: { minutes: number; notBefore: LocalDate | null; currentStart: Instant | null };
    day: LocalDate;
    zone: Zone;
    now: Instant;
    busy: Busy[];
    preferred: TimeOfDay[];
}

export interface Proposal {
    start: Instant;
    end: Instant;
    bucket: TimeOfDay;
}

const ms = (instant: Instant) => Date.parse(instant);
const iso = (value: number) => new Date(value).toISOString();

export function busyBlocks(
    tasks: readonly { id: string; state: string; scheduledStart: Instant | null; scheduledEnd: Instant | null }[],
    excludeId: string,
): Busy[] {
    return tasks.flatMap((t) =>
        t.id !== excludeId &&
        t.state !== "COMPLETE" &&
        t.state !== "ARCHIVED" &&
        t.scheduledStart &&
        t.scheduledEnd &&
        ms(t.scheduledEnd) > ms(t.scheduledStart)
            ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
            : [],
    );
}

const atHour = (day: LocalDate, hour: number, zone: Zone) =>
    hour >= 24
        ? ms(atLocal(addDays(day, 1), "00:00", zone))
        : ms(atLocal(day, `${String(hour).padStart(2, "0")}:00`, zone));

export function dayWindow(day: LocalDate, hours: DayHours, zone: Zone): { from: number; to: number } {
    const from = atHour(day, Math.max(hours.timelineStartHour, EARLIEST_HOUR), zone);
    return { from, to: Math.max(from, atHour(day, hours.dayEndHour ?? DEFAULT_DAY_END_HOUR, zone)) };
}

export const nextGridMark = (at: number) => Math.ceil(at / (GRID_MINUTES * MIN)) * GRID_MINUTES * MIN;

function fitting(input: FindTimeInput): { start: number; length: number }[] {
    const { task, day, zone, now, busy } = input;
    if (task.minutes < 1 || (task.notBefore && day < task.notBefore)) return [];

    const window = dayWindow(day, input, zone);
    let from = window.from;
    const windowEnd = window.to;
    if (day === todayIn(zone, new Date(now))) from = Math.max(from, nextGridMark(ms(now)));

    const length = task.minutes * MIN;
    const buffer = BUFFER_MINUTES * MIN;
    const blocks = busy.map((b) => [ms(b.start), ms(b.end)] as const);
    const out: { start: number; length: number }[] = [];
    for (let start = from; start + length <= windowEnd; start += GRID_MINUTES * MIN) {
        if (!blocks.some(([bs, be]) => bs < start + length + buffer && be > start - buffer))
            out.push({ start, length });
    }
    return out;
}

export function feasibleBuckets(input: FindTimeInput): TimeOfDay[] {
    return [...new Set(fitting(input).map(({ start }) => bucketOf(iso(start), input.zone)))];
}

export function findTimes(input: FindTimeInput): Proposal[] {
    const { task, day, zone, preferred } = input;
    const current = task.currentStart && dayOf(task.currentStart, zone) === day ? ms(task.currentStart) : null;
    const fits = fitting(input)
        .map(({ start, length }) => {
            const rank = preferred.indexOf(bucketOf(iso(start), zone));
            return {
                start,
                length,
                rank: rank < 0 ? preferred.length : rank,
                distance: current === null ? 0 : Math.abs(start - current),
            };
        })
        .sort((a, b) => a.rank - b.rank || a.distance - b.distance || a.start - b.start);

    const kept: Proposal[] = [];
    for (const { start, length } of fits) {
        if (kept.length === MAX_PROPOSALS) break;
        if (kept.some((k) => ms(k.start) < start + length && ms(k.end) > start)) continue;
        const startIso = iso(start);
        kept.push({ start: startIso, end: iso(start + length), bucket: bucketOf(startIso, zone) });
    }
    return kept;
}
