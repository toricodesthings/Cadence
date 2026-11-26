import { RRule } from "rrule";
import {
    addDays,
    dayOf,
    daysBetween,
    expandSeries,
    parseRecurrenceRule,
    weekdayOf,
    type LocalDate,
    type Zone,
} from "./time";

const RRULE_DAY_KEYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function routineTimeOn(
    routine: { targetTime: string | null; targetTimes?: Record<string, string> | null },
    date: string,
): string | null {
    const key = RRULE_DAY_KEYS[weekdayOf(date)];
    const overrides = routine.targetTimes;
    if (overrides && key in overrides) return overrides[key] || null;
    return routine.targetTime;
}

export function isPausedOn(pausedUntil: string | null | undefined, day: string, today: string): boolean {
    return !!pausedUntil && day >= today && day <= pausedUntil;
}

function habitStart(recurrenceRule: string, createdAt: string, from: LocalDate, zone: Zone) {
    const { freq, interval = 1, count } = parseRecurrenceRule(recurrenceRule, zone);
    let anchor = dayOf(createdAt, zone);
    if (anchor > from && interval <= 1 && !count) {
        if (freq === RRule.DAILY || freq === RRule.WEEKLY) {
            const period = freq === RRule.DAILY ? 1 : 7;
            anchor = addDays(anchor, -Math.ceil(daysBetween(from, anchor) / period) * period);
        } else {
            const y = Number(anchor.slice(0, 4));
            const targetYear = y - (y - Number(from.slice(0, 4)) + 1);
            const rest = anchor.slice(4);
            const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
            const safeRest = rest === "-02-29" && !isLeap ? "-02-28" : rest;
            anchor = `${String(targetYear).padStart(4, "0")}${safeRest}`;
        }
    }
    return anchor;
}

export function habitOccurrences(
    recurrenceRule: string,
    createdAt: string,
    from: LocalDate,
    to: LocalDate,
    zone: Zone,
): LocalDate[] {
    return expandSeries({
        rule: recurrenceRule,
        start: { day: habitStart(recurrenceRule, createdAt, from, zone) },
        zone,
        range: { from, to },
    }).map((occurrence) => occurrence.day);
}

type StepMark = "COMPLETED" | "SKIPPED";

export function stepDayStatus(
    stepIds: readonly string[],
    marks: Readonly<Record<string, StepMark>>,
): { status: StepMark | "PENDING"; stepStatus: Record<string, StepMark> | null } {
    const kept = Object.fromEntries(stepIds.flatMap((id) => (marks[id] ? [[id, marks[id]]] : []))) as Record<
        string,
        StepMark
    >;
    const settled = Object.values(kept);
    if (!settled.length) return { status: "PENDING", stepStatus: null };
    if (settled.length < stepIds.length) return { status: "PENDING", stepStatus: kept };
    return { status: settled.every((mark) => mark === "SKIPPED") ? "SKIPPED" : "COMPLETED", stepStatus: kept };
}

export function stepMarksOn(
    stepIds: readonly string[],
    log: { status: string; stepStatus?: Readonly<Record<string, StepMark>> | null } | undefined,
): Record<string, StepMark> {
    if (log?.stepStatus) return stepDayStatus(stepIds, log.stepStatus).stepStatus ?? {};
    if (log?.status === "COMPLETED" || log?.status === "SKIPPED")
        return Object.fromEntries(stepIds.map((id) => [id, log.status as StepMark]));
    return {};
}

export interface TimeMarkOn {
    status: StepMark;
    at: string | null;
}

export function routineTimesOn(
    routine: {
        targetTime: string | null;
        targetTimes?: Record<string, string> | null;
        times?: readonly string[] | null;
    },
    date: string,
): string[] {
    if (routine.times?.length) return [...routine.times].sort();
    const time = routineTimeOn(routine, date);
    return time ? [time] : [];
}

export function timeMarksOn(
    times: readonly string[],
    log: { status: string; timeMarks?: Readonly<Record<string, TimeMarkOn>> | null } | undefined,
): Record<string, TimeMarkOn> {
    if (log?.timeMarks)
        return Object.fromEntries(
            times.flatMap((time) => (log.timeMarks![time] ? [[time, log.timeMarks![time]]] : [])),
        );
    if (log?.status === "COMPLETED" || log?.status === "SKIPPED")
        return Object.fromEntries(times.map((time) => [time, { status: log.status as StepMark, at: null }]));
    return {};
}

export function timeDayStatus(
    times: readonly string[],
    marks: Readonly<Record<string, TimeMarkOn>>,
): StepMark | "PENDING" {
    const settled = times.filter((time) => marks[time]);
    if (!times.length || settled.length < times.length) return "PENDING";
    return settled.every((time) => marks[time].status === "COMPLETED") ? "COMPLETED" : "SKIPPED";
}

export function applyTimeMark(
    times: readonly string[],
    log: Parameters<typeof timeMarksOn>[1],
    change: { time?: string; status: StepMark | "PENDING"; at: string },
): { status: StepMark | "PENDING"; timeMarks: Record<string, TimeMarkOn> | null } {
    const marks: Record<string, TimeMarkOn> = {};
    if (change.time) {
        Object.assign(marks, timeMarksOn(times, log));
        if (change.status === "PENDING") delete marks[change.time];
        else if (marks[change.time]?.status !== change.status)
            marks[change.time] = { status: change.status, at: change.at };
    }
    return { status: timeDayStatus(times, marks), timeMarks: Object.keys(marks).length ? marks : null };
}

export function timeProgress(times: readonly string[], marks: Readonly<Record<string, TimeMarkOn>>) {
    const done = times.filter((time) => marks[time]?.status === "COMPLETED").length;
    const skipped = times.filter((time) => marks[time]?.status === "SKIPPED").length;
    return { done, skipped, open: times.length - done - skipped, total: times.length };
}

export function nextOpenTime(
    times: readonly string[],
    marks: Readonly<Record<string, TimeMarkOn>>,
    now: string,
): string | null {
    const open = [...times].sort().filter((time) => !marks[time]);
    return open.find((time) => time >= now) ?? open.at(-1) ?? null;
}

export const LIKELY_TIME_MINUTES = 90;

export function likelyOpenTime(
    times: readonly string[],
    marks: Readonly<Record<string, TimeMarkOn>>,
    now: string | null,
): string | null {
    const open = times.filter((time) => !marks[time]);
    if (now === null) return open.length === 1 ? open[0] : null;
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const gap = (time: string) => Math.abs(minutes(time) - minutes(now));
    const nearest = [...open].sort((a, b) => gap(a) - gap(b))[0];
    return nearest !== undefined && gap(nearest) <= LIKELY_TIME_MINUTES ? nearest : null;
}

const FIXED_WORDS =
    /\b(class|lecture|lab|seminar|tutorial|lesson|course|school|shift|stand-?up|meeting|appointment|therapy)\b/i;

export function suggestInteractionMode(task: {
    title: string;
    recurrenceRule?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
}): "task" | "timetable" {
    const timedSeries = Boolean(task.recurrenceRule && task.scheduledStart && task.scheduledEnd);
    return timedSeries && FIXED_WORDS.test(task.title) ? "timetable" : "task";
}

export function habitDays<L extends { targetDate: string }>(
    habit: { recurrenceRule: string; createdAt: string; pausedUntil: string | null },
    logsByDate: Map<string, L>,
    from: string,
    to: string,
    timeZone: string,
    today: string,
): { date: string; log: L | undefined }[] {
    const firstDay = addDays(dayOf(habit.createdAt, timeZone), -1);
    return habitOccurrences(habit.recurrenceRule, String(habit.createdAt), from, to, timeZone)
        .filter((date) => date >= firstDay || logsByDate.has(date))
        .filter((date) => !isPausedOn(habit.pausedUntil, date, today))
        .map((date) => ({ date, log: logsByDate.get(date) }));
}
