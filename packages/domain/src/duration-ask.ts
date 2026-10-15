// When "How long did it take?" may be asked. Pure: the server runs it, so one device's answer or miss counts everywhere.
import { daysBetween, type LocalDate } from "./time";

/** `users.settings.assistant.durationAsk`: server-owned, written only by the ask routes. */
export interface DurationAskState {
    lastOn: LocalDate | null;
    /** Toasts shown and not answered since the last answer. */
    misses: number;
}

/** After 3 unanswered asks: every 3 days; after 6: weekly. An answer resets it. */
export function minDaysBetweenAsks(misses: number): number {
    return misses >= 6 ? 7 : misses >= 3 ? 3 : 1;
}

/** One shown ask per person per local day, spaced further apart the more of them go unanswered. */
export function budgetOpen(state: DurationAskState | null | undefined, today: LocalDate): boolean {
    if (!state?.lastOn) return true;
    return daysBetween(state.lastOn, today) >= minDaysBetweenAsks(state.misses);
}

/** What the group already knows: its reports' minutes, and how old the newest is. */
export interface GroupHistory {
    minutes: number[];
    newestDaysAgo: number | null;
}

const SETTLED_MIN_REPORTS = 3;
const SETTLED_SPREAD = 0.35;
const STALE_DAYS = 30;

/** 3 or more reports within ±35% of their median, and recent: nothing left to learn. */
export function groupIsSettled(history: GroupHistory): boolean {
    const { minutes, newestDaysAgo } = history;
    if (minutes.length < SETTLED_MIN_REPORTS) return false;
    if (newestDaysAgo !== null && newestDaysAgo > STALE_DAYS) return false;
    const sorted = [...minutes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    return sorted.every((m) => Math.abs(m - median) <= median * SETTLED_SPREAD);
}

/** A task completed this soon after it was created is a done list being written down, not timed work. */
export const MIN_TASK_AGE_MS = 2 * 60_000;

export interface AskCandidate {
    state: DurationAskState | null | undefined;
    today: LocalDate;
    /** Milliseconds between the task's creation and its completion. */
    ageMs: number;
    history: GroupHistory;
}

export function shouldAsk({ state, today, ageMs, history }: AskCandidate): boolean {
    return budgetOpen(state, today) && ageMs >= MIN_TASK_AGE_MS && !groupIsSettled(history);
}

/** The number the relative toast compares to: the estimate, else the timed block, else the group's median. */
export function referenceMinutes(task: { durationEstimate: number | null; blockMinutes: number | null }, history: GroupHistory): number | null {
    if (task.durationEstimate) return task.durationEstimate;
    if (task.blockMinutes) return task.blockMinutes;
    if (history.minutes.length === 0) return null;
    const sorted = [...history.minutes].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
