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
