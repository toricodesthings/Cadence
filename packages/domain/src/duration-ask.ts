import { daysBetween, type LocalDate } from "./time";

export interface DurationAskState {
    lastOn: LocalDate | null;
    misses: number;
    token?: string;
    shownToken?: string;
}

export function minDaysBetweenAsks(misses: number): number {
    return misses >= 10 ? 30 : misses >= 6 ? 7 : misses >= 3 ? 3 : 1;
}

export function budgetOpen(state: DurationAskState | null | undefined, today: LocalDate): boolean {
    if (!state?.lastOn) return true;
    return daysBetween(state.lastOn, today) >= minDaysBetweenAsks(state.misses);
}

export interface GroupHistory {
    minutes: number[];
    newestDaysAgo: number | null;
}

const SETTLED_MIN_REPORTS = 3;
const SETTLED_SPREAD = 0.35;
const STALE_DAYS = 30;

export function groupIsSettled(history: GroupHistory): boolean {
    const { minutes, newestDaysAgo } = history;
    if (minutes.length < SETTLED_MIN_REPORTS) return false;
    if (newestDaysAgo !== null && newestDaysAgo > STALE_DAYS) return false;
    const sorted = [...minutes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    return sorted.every((m) => Math.abs(m - median) <= median * SETTLED_SPREAD);
}

export const MIN_TASK_AGE_MS = 2 * 60_000;

export interface AskCandidate {
    state: DurationAskState | null | undefined;
    today: LocalDate;
    ageMs: number;
    history: GroupHistory;
}

export function shouldAsk({ state, today, ageMs, history }: AskCandidate): boolean {
    return budgetOpen(state, today) && ageMs >= MIN_TASK_AGE_MS && !groupIsSettled(history);
}

export function referenceMinutes(task: {
    durationEstimate: number | null;
    blockMinutes: number | null;
}): number | null {
    return task.durationEstimate || task.blockMinutes || null;
}

const DEFAULT_BLOCK_MINUTES = 60;

export function relativeReference(reference: number | null, guess: number | null): number | null {
    return reference && reference !== DEFAULT_BLOCK_MINUTES && reference !== guess ? reference : null;
}
