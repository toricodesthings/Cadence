// Find a time: the gaps in a day a task of a given length fits into. Pure: it reads the day's busy blocks and
// proposes; it never moves, shortens or splits anything, and nothing is written until the person's own tap.
import type { TimeOfDay } from "@cadence/contracts/planning";
import { atLocal, dayOf, todayIn, wallTimeOf, type Instant, type LocalDate, type WallTime, type Zone } from "./time";

export type { TimeOfDay };

/** ponytail: no day-end setting exists; add one only if people ask. */
export const DAY_END: WallTime = "22:00";
/** Never earlier than this, whatever the calendar's first hour says. */
const EARLIEST_HOUR = 6;
/** A found time never sits flush against another block: room to get there and switch. */
export const BUFFER_MINUTES = 15;
const GRID_MINUTES = 15;
const MAX_PROPOSALS = 8;
const MIN = 60_000;

/** Local hour → part of the day. */
export function timeOfDay(hour: number): TimeOfDay {
    if (hour < 9) return "early";
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    if (hour < 21) return "evening";
    return "late";
}

/** The part of the day an instant starts in, for the person's zone. */
export const bucketOf = (instant: Instant, zone: Zone): TimeOfDay => timeOfDay(Number(wallTimeOf(instant, zone).slice(0, 2)));

export interface Busy { start: Instant; end: Instant }

export interface FindTimeInput {
    task: { minutes: number; notBefore: LocalDate | null; currentStart: Instant | null };
    day: LocalDate;
    zone: Zone;
    now: Instant;
    timelineStartHour: number;
    /** Timed tasks that aren't done (series expanded) and Fixed blocks. Never routines or all-day items, and never the task itself. */
    busy: Busy[];
    /** Stated, then learned: earlier first. `[]` = none. */
    preferred: TimeOfDay[];
}

export interface Proposal { start: Instant; end: Instant; bucket: TimeOfDay }

const ms = (instant: Instant) => Date.parse(instant);
const iso = (value: number) => new Date(value).toISOString();

/**
 * The blocks a task can't overlap: the day's timed tasks that are open and have a real block.
 * `excludeId` is the task being placed.
 */
export function busyBlocks(tasks: readonly { id: string; state: string; scheduledStart: Instant | null; scheduledEnd: Instant | null }[], excludeId: string): Busy[] {
    return tasks.flatMap((t) =>
        t.id !== excludeId && t.state !== "COMPLETE" && t.state !== "ARCHIVED" && t.scheduledStart && t.scheduledEnd && ms(t.scheduledEnd) > ms(t.scheduledStart)
            ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
            : [],
    );
}

/** Every start that fits (before ordering and spacing): the day's gaps, as 15-minute grid points. */
function fitting(input: FindTimeInput): { start: number; length: number }[] {
    const { task, day, zone, now, busy } = input;
    if (task.minutes < 1 || (task.notBefore && day < task.notBefore)) return [];

    const hour = String(Math.max(input.timelineStartHour, EARLIEST_HOUR)).padStart(2, "0");
    let from = ms(atLocal(day, `${hour}:00`, zone));
    const windowEnd = ms(atLocal(day, DAY_END, zone));
    if (day === todayIn(zone, new Date(now))) from = Math.max(from, Math.ceil(ms(now) / (GRID_MINUTES * MIN)) * GRID_MINUTES * MIN);

    const length = task.minutes * MIN;
    const buffer = BUFFER_MINUTES * MIN;
    const blocks = busy.map((b) => [ms(b.start), ms(b.end)] as const);
    const out: { start: number; length: number }[] = [];
    for (let start = from; start + length <= windowEnd; start += GRID_MINUTES * MIN) {
        if (!blocks.some(([bs, be]) => bs < start + length + buffer && be > start - buffer)) out.push({ start, length });
    }
    return out;
}

/** The parts of the day that have room for the task: what a choice among them is compared against. */
export function feasibleBuckets(input: FindTimeInput): TimeOfDay[] {
    return [...new Set(fitting(input).map(({ start }) => bucketOf(iso(start), input.zone)))];
}

/**
 * Proposals on `day`, best first, never overlapping each other (a list of near-identical slots helps no one):
 * every 15-minute start inside the window that fits with a 15-minute buffer around other blocks; in a preferred
 * time of day first, then nearest the task's current start on this day, then earliest. Nothing fits → `[]`.
 */
export function findTimes(input: FindTimeInput): Proposal[] {
    const { task, day, zone, preferred } = input;
    const current = task.currentStart && dayOf(task.currentStart, zone) === day ? ms(task.currentStart) : null;
    const fits = fitting(input)
        .map(({ start, length }) => {
            const rank = preferred.indexOf(bucketOf(iso(start), zone));
            return { start, length, rank: rank < 0 ? preferred.length : rank, distance: current === null ? 0 : Math.abs(start - current) };
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
