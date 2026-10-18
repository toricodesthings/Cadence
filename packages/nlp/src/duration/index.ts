// What a task is likely to take, from the lengths this person said on the same kind of task. Pure and deterministic:
// the person's answers and the reference day come in; a guess or nothing comes out. The constants are engineering
// choices, kept here so they change in one place.
import { daysBetweenLocal, type LocalDate } from "../core/index.js";
import { HALF_LIFE_DAYS, meaningOf, similarity } from "../effort/index.js";

export { HALF_LIFE_DAYS };
/** Older answers are kept but not used. */
export const WINDOW_DAYS = 365;
/** The closest, then newest, matches that are weighed. */
export const MAX_MATCHES = 12;
export const MIN_SIMILARITY = 0.8;
/** An "About right" or relative-chip answer carries half the weight: the shown number pulled it. */
export const WEIGHT_ANCHORED = 0.5;
/** A "30–60" answer carries half the weight of a point. */
export const WEIGHT_RANGE = 0.5;
/** The range is at least centre ÷ MIN_SPREAD … centre × MIN_SPREAD. */
export const MIN_SPREAD = 1.25;
export const TENTATIVE_MAX_AGE = 90;
export const SUPPORTED_MAX_AGE = 60;
export const TENTATIVE_MAX_RATIO = 3;
export const SUPPORTED_MAX_RATIO = 2.5;
/** The two newest answers this far from the older ones' median, on the same side, replace them. */
export const DRIFT_FACTOR = 2;

/** One answer the person gave (a point has low = high). */
export interface DurationEvidence {
  taskId: string;
  title: string;
  projectId: string | null;
  /** The task repeats: the same task id is the same thing. */
  series: boolean;
  low: number;
  high: number;
  anchored: boolean;
  day: LocalDate;
}

export interface DurationGuess {
  /** `supported` sizes new blocks; `tentative` is shown with a "?" and sizes nothing. */
  state: "tentative" | "supported";
  minutes: number;
  low: number;
  high: number;
  reports: number;
  days: number;
}

/** Minutes as the person sees and accepts them: under an hour to 5, to 3 hours to 15, beyond to 30. At least 5. */
export function roundMinutes(minutes: number): number {
  const step = minutes < 60 ? 5 : minutes <= 180 ? 15 : 30;
  return Math.max(5, Math.round(minutes / step) * step);
}

/** The first value (in order) whose running weight reaches `p` of the total: [5, 15] at equal weight has a median of 5. */
export function weightedQuantile(values: readonly number[], weights: readonly number[], p: number): number {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const target = p * order.reduce((sum, i) => sum + weights[i], 0) - 1e-9;
  let running = 0;
  for (const i of order) {
    running += weights[i];
    if (running >= target) return values[i];
  }
  return values[order[order.length - 1]];
}

interface Match {
  e: DurationEvidence;
  sim: number;
  age: number;
  centre: number;
  range: boolean;
}

const centreOf = (e: DurationEvidence) => (e.low === e.high ? e.low : Math.sqrt(e.low * e.high));
const weightOf = ({ e, sim, age, range }: Match) =>
  (e.anchored ? WEIGHT_ANCHORED : 1) * (range ? WEIGHT_RANGE : 1) * 0.5 ** (age / HALF_LIFE_DAYS) * sim;

/** A guess for the query from the person's answers, or nothing. A wrong guess costs more than a missing one. */
export function estimateDuration(
  q: { taskId: string | null; title: string; projectId: string | null },
  evidence: readonly DurationEvidence[],
  today: LocalDate,
): DurationGuess | null {
  const query = meaningOf(q.title);
  let matches: Match[] = evidence
    .map((e) => ({
      e,
      sim: q.taskId && e.taskId === q.taskId ? 1 : similarity(query, meaningOf(e.title)),
      age: daysBetweenLocal(e.day, today),
      centre: centreOf(e),
      range: e.low !== e.high,
    }))
    // A different list is a different context (another course, another project).
    .filter(({ e, sim, age }) => sim >= MIN_SIMILARITY && age >= 0 && age <= WINDOW_DAYS && !(q.projectId && e.projectId && e.projectId !== q.projectId))
    .sort((x, y) => y.sim - x.sim || x.age - y.age || x.e.taskId.localeCompare(y.e.taskId))
    .slice(0, MAX_MATCHES);
  if (matches.length === 0) return null;

  // Drift: a new job or course changes the guess within two answers, with no reset.
  if (matches.length >= 4) {
    const byAge = [...matches].sort((x, y) => x.age - y.age);
    const newest = byAge.slice(0, 2);
    const older = byAge.slice(2);
    const median = weightedQuantile(older.map((m) => m.centre), older.map(weightOf), 0.5);
    const above = newest.every((m) => m.centre > median * DRIFT_FACTOR);
    const below = newest.every((m) => m.centre < median / DRIFT_FACTOR);
    if (above || below) matches = newest;
  }

  const w = matches.map(weightOf);
  const centre = weightedQuantile(matches.map((m) => m.centre), w, 0.5);
  const low = Math.min(weightedQuantile(matches.map((m) => m.e.low), w, 0.1), centre / MIN_SPREAD);
  const high = Math.max(weightedQuantile(matches.map((m) => m.e.high), w, 0.9), centre * MIN_SPREAD);

  const days = new Set(matches.map((m) => m.e.day)).size;
  const newestAge = Math.min(...matches.map((m) => m.age));
  const ratio = high / low;
  const supported =
    matches.length >= 3 && days >= 2 && matches.filter((m) => !m.e.anchored).length >= 2 && newestAge <= SUPPORTED_MAX_AGE && ratio <= SUPPORTED_MAX_RATIO;
  const tentative =
    (matches.some((m) => m.sim === 1 && q.taskId) || matches.length >= 2) && newestAge <= TENTATIVE_MAX_AGE && ratio <= TENTATIVE_MAX_RATIO;
  if (!supported && !tentative) return null;

  const clip = (minutes: number) => Math.min(1440, Math.max(1, minutes));
  return {
    state: supported ? "supported" : "tentative",
    minutes: roundMinutes(clip(centre)),
    low: roundMinutes(clip(low)),
    high: roundMinutes(clip(high)),
    reports: matches.length,
    days,
  };
}
