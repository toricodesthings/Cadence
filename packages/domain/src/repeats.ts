// Repeating things come in three kinds (Fixed · Routine · Task). These helpers
// hold the rules shared by every client.
import { RRule } from "rrule";
import { addDays, dayOf, daysBetween, expandSeries, parseRecurrenceRule, weekdayOf, type LocalDate, type Zone } from "./time";

const RRULE_DAY_KEYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * A routine's time on a given day: the weekday override when one is set
 * ("" means "any time that day"), otherwise the routine's usual time.
 */
export function routineTimeOn(
    routine: { targetTime: string | null; targetTimes?: Record<string, string> | null },
    date: string,
): string | null {
    const key = RRULE_DAY_KEYS[weekdayOf(date)];
    const overrides = routine.targetTimes;
    if (overrides && key in overrides) return overrides[key] || null;
    return routine.targetTime;
}

/**
 * Whether a routine's pause covers `day`. A pause runs from `today` through
 * `pausedUntil` (all `YYYY-MM-DD`); it never hides a day already past.
 */
export function isPausedOn(pausedUntil: string | null | undefined, day: string, today: string): boolean {
    return !!pausedUntil && day >= today && day <= pausedUntil;
}

/**
 * A routine's rule, anchored so its days never depend on when it was created.
 * A rule without INTERVAL or COUNT repeats every day/week/month/year the same
 * way, so its anchor (the creation day in `zone`) is moved back by whole
 * periods to on or before `from`: earlier days follow the same pattern and can
 * be logged. "Every N" rules keep the creation day, which they count from.
 * Routines live on LocalDates, so the rule runs in a floating UTC frame.
 */
function habitStart(recurrenceRule: string, createdAt: string, from: LocalDate, zone: Zone) {
    const { freq, interval = 1, count } = parseRecurrenceRule(recurrenceRule, zone);
    let anchor = dayOf(createdAt, zone);
    if (anchor > from && interval <= 1 && !count) {
        if (freq === RRule.DAILY || freq === RRule.WEEKLY) {
            const period = freq === RRule.DAILY ? 1 : 7;
            anchor = addDays(anchor, -Math.ceil(daysBetween(from, anchor) / period) * period);
        } else {
            // Months and years: step back whole years so the day of the month stays.
            const [y, rest] = [Number(anchor.slice(0, 4)), anchor.slice(4)];
            anchor = `${String(y - (y - Number(from.slice(0, 4)) + 1)).padStart(4, "0")}${rest}`;
        }
    }
    return anchor;
}

/**
 * The days a routine is due between two days, inclusive (see {@link habitStart}).
 * Throws on an invalid rule.
 */
export function habitOccurrences(recurrenceRule: string, createdAt: string, from: LocalDate, to: LocalDate, zone: Zone): LocalDate[] {
    return expandSeries({ rule: recurrenceRule, start: { day: habitStart(recurrenceRule, createdAt, from, zone) }, zone, range: { from, to } })
        .map((occurrence) => occurrence.day);
}

type StepMark = "COMPLETED" | "SKIPPED";

/**
 * A routine day's status from its steps, keeping only steps the routine still
 * has. Every step settled → COMPLETED (SKIPPED when every one was skipped);
 * some → PENDING, a partial day that's kept; none → PENDING with nothing to keep.
 */
export function stepDayStatus(
    stepIds: readonly string[],
    marks: Readonly<Record<string, StepMark>>,
): { status: StepMark | "PENDING"; stepStatus: Record<string, StepMark> | null } {
    const kept = Object.fromEntries(stepIds.flatMap((id) => (marks[id] ? [[id, marks[id]]] : []))) as Record<string, StepMark>;
    const settled = Object.values(kept);
    if (!settled.length) return { status: "PENDING", stepStatus: null };
    if (settled.length < stepIds.length) return { status: "PENDING", stepStatus: kept };
    return { status: settled.every((mark) => mark === "SKIPPED") ? "SKIPPED" : "COMPLETED", stepStatus: kept };
}

/**
 * Each step's mark on a day. A day checked off (or skipped) as a whole, without
 * step marks, reads as every step done (or skipped).
 */
export function stepMarksOn(
    stepIds: readonly string[],
    log: { status: string; stepStatus?: Readonly<Record<string, StepMark>> | null } | undefined,
): Record<string, StepMark> {
    if (log?.stepStatus) return stepDayStatus(stepIds, log.stepStatus).stepStatus ?? {};
    if (log?.status === "COMPLETED" || log?.status === "SKIPPED") return Object.fromEntries(stepIds.map((id) => [id, log.status as StepMark]));
    return {};
}

/** A routine at set times: one mark per "HH:MM". `at` is when it happened; null on a day logged whole. */
export type TimeMarkOn = { status: StepMark; at: string | null };

/**
 * A routine's times on a day: its set times when it has them (they replace the
 * usual time and weekday overrides), otherwise its one time, otherwise none.
 */
export function routineTimesOn(
    routine: { targetTime: string | null; targetTimes?: Record<string, string> | null; times?: readonly string[] | null },
    date: string,
): string[] {
    if (routine.times?.length) return [...routine.times].sort();
    const time = routineTimeOn(routine, date);
    return time ? [time] : [];
}

/**
 * Each time's mark on a day, keeping only times the routine still has. A day
 * checked off (or skipped) as a whole, before the routine had set times, reads
 * as every time done (or skipped) with no recorded instant.
 */
export function timeMarksOn(
    times: readonly string[],
    log: { status: string; timeMarks?: Readonly<Record<string, TimeMarkOn>> | null } | undefined,
): Record<string, TimeMarkOn> {
    if (log?.timeMarks) return Object.fromEntries(times.flatMap((time) => (log.timeMarks![time] ? [[time, log.timeMarks![time]]] : [])));
    if (log?.status === "COMPLETED" || log?.status === "SKIPPED") return Object.fromEntries(times.map((time) => [time, { status: log.status as StepMark, at: null }]));
    return {};
}

/**
 * A routine day's status from its times. Every time done → COMPLETED. Nothing
 * left open but some skipped → SKIPPED (closed, never claimed as done). Any
 * time still open → PENDING. A miss never carries forward: the next day starts fresh.
 */
export function timeDayStatus(times: readonly string[], marks: Readonly<Record<string, TimeMarkOn>>): StepMark | "PENDING" {
    const settled = times.filter((time) => marks[time]);
    if (!times.length || settled.length < times.length) return "PENDING";
    return settled.every((time) => marks[time].status === "COMPLETED") ? "COMPLETED" : "SKIPPED";
}

/**
 * A day's log after one time is marked (`PENDING` clears it) or, with no `time`,
 * after the whole day is cleared. Other times keep their marks, a day logged
 * whole included. Server and optimistic cache both use it.
 */
export function applyTimeMark(
    times: readonly string[],
    log: Parameters<typeof timeMarksOn>[1],
    change: { time?: string; status: StepMark | "PENDING"; at: string },
): { status: StepMark | "PENDING"; timeMarks: Record<string, TimeMarkOn> | null } {
    const marks: Record<string, TimeMarkOn> = {};
    if (change.time) {
        Object.assign(marks, timeMarksOn(times, log));
        if (change.status === "PENDING") delete marks[change.time];
        else if (marks[change.time]?.status !== change.status) marks[change.time] = { status: change.status, at: change.at }; // a repeat keeps when it happened
    }
    return { status: timeDayStatus(times, marks), timeMarks: Object.keys(marks).length ? marks : null };
}

/** Counts for "1 of 3 done" / "2 done · 1 skipped". */
export function timeProgress(times: readonly string[], marks: Readonly<Record<string, TimeMarkOn>>) {
    const done = times.filter((time) => marks[time]?.status === "COMPLETED").length;
    const skipped = times.filter((time) => marks[time]?.status === "SKIPPED").length;
    return { done, skipped, open: times.length - done - skipped, total: times.length };
}

/**
 * The time "Mark done" records: the first open time not yet past `now` ("HH:MM"),
 * else the latest open one (everything left is late). Earlier open times stay
 * reachable in the checklist. Null once nothing is open.
 */
export function nextOpenTime(times: readonly string[], marks: Readonly<Record<string, TimeMarkOn>>, now: string): string | null {
    const open = [...times].sort().filter((time) => !marks[time]);
    return open.find((time) => time >= now) ?? open.at(-1) ?? null;
}

// ponytail: keyword list, not a classifier. The user can switch kinds in one tap.
const FIXED_WORDS = /\b(class|lecture|lab|seminar|tutorial|lesson|course|school|shift|stand-?up|meeting|appointment|therapy)\b/i;

/**
 * Default "each time" behaviour for a new task. A timed series with an end
 * whose title reads like something that happens to you (class, shift…)
 * becomes a Fixed block; everything else stays a task.
 */
export function suggestInteractionMode(task: {
    title: string;
    recurrenceRule?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
}): "task" | "timetable" {
    const timedSeries = Boolean(task.recurrenceRule && task.scheduledStart && task.scheduledEnd);
    return timedSeries && FIXED_WORDS.test(task.title) ? "timetable" : "task";
}
