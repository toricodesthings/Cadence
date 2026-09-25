// Repeating things come in three kinds (Fixed · Routine · Task). These helpers
// hold the rules shared by every client.
import { RRule, rrulestr } from "rrule";

const RRULE_DAY_KEYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * A routine's time on a given day: the weekday override when one is set
 * ("" means "any time that day"), otherwise the routine's usual time.
 */
export function routineTimeOn(
    routine: { targetTime: string | null; targetTimes?: Record<string, string> | null },
    date: string,
): string | null {
    const [y, m, d] = date.slice(0, 10).split("-").map(Number);
    const key = RRULE_DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const overrides = routine.targetTimes;
    if (overrides && key in overrides) return overrides[key] || null;
    return routine.targetTime;
}

const DAY_MS = 86_400_000;

/** The calendar day (`YYYY-MM-DD`) an instant falls on in `timeZone`; an unknown zone reads as UTC. */
export function localDay(instant: string | Date, timeZone = "UTC"): string {
    const date = new Date(instant);
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/**
 * A routine's rule, anchored so its days never depend on when it was created.
 * A rule without INTERVAL or COUNT repeats every day/week/month/year the same
 * way, so its anchor (the creation day in `timeZone`) is moved back by whole
 * periods to on or before `from`: earlier days follow the same pattern and can
 * be logged. "Every N" rules keep the creation day, which they count from.
 */
export function habitRule(recurrenceRule: string, createdAt: string, from: Date, timeZone = "UTC") {
    const { freq, interval = 1, count } = RRule.parseString(recurrenceRule);
    let anchor = Date.parse(`${localDay(createdAt, timeZone)}T00:00:00.000Z`);
    const floor = Date.parse(`${from.toISOString().slice(0, 10)}T00:00:00.000Z`);
    if (anchor > floor && interval <= 1 && !count) {
        if (freq === RRule.DAILY || freq === RRule.WEEKLY) {
            const period = (freq === RRule.DAILY ? 1 : 7) * DAY_MS;
            anchor -= Math.ceil((anchor - floor) / period) * period;
        } else {
            // Months and years: step back whole years so the day of the month stays.
            const date = new Date(anchor);
            date.setUTCFullYear(date.getUTCFullYear() - (date.getUTCFullYear() - new Date(floor).getUTCFullYear() + 1));
            anchor = date.getTime();
        }
    }
    return rrulestr(recurrenceRule, { dtstart: new Date(anchor) });
}

/**
 * The days (`YYYY-MM-DD`) a routine is due between two instants, inclusive,
 * each a plain calendar date (see {@link habitRule}). Throws on an invalid rule.
 */
export function habitOccurrences(recurrenceRule: string, createdAt: string, start: Date, end: Date, timeZone = "UTC"): string[] {
    return habitRule(recurrenceRule, createdAt, start, timeZone)
        .between(start, end, true)
        .map((d) => d.toISOString().slice(0, 10));
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
    isAllDay?: boolean | null;
}): "task" | "timetable" {
    const timedSeries = Boolean(task.recurrenceRule && task.scheduledStart && task.scheduledEnd && task.isAllDay === false);
    return timedSeries && FIXED_WORDS.test(task.title) ? "timetable" : "task";
}
