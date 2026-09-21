// Repeating things come in three kinds (Fixed · Routine · Task). These helpers
// hold the rules shared by every client.

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
