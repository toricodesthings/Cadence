// Personal Effort suggestion: from the levels this person chose on similar tasks, never from a rule about words.
// Pure and deterministic: evidence and the reference day come in; a suggestion or nothing comes out.
import { daysBetweenLocal, type LocalDate } from "../core/index.js";

export type EffortLevel = 1 | 2 | 3;

/** One earlier task whose Effort the person chose (the caller has already checked it may count). */
export interface EffortEvidence {
  title: string;
  projectId: string | null;
  level: EffortLevel;
  /** "manual" is a direct choice; "accepted" is a suggestion they agreed to, which counts for less. */
  origin: "manual" | "accepted";
  /** The day the choice was made. */
  day: LocalDate;
}

export type EffortSuggestion =
  | { kind: "level"; level: EffortLevel; support: number }
  | { kind: "range"; low: EffortLevel; high: EffortLevel; support: number };

/** Evidence older than this stops counting. */
export const EVIDENCE_WINDOW_DAYS = 365;
/** At most this many of the closest, most recent matches are weighed. */
export const MAX_EVIDENCE = 12;
/** Total weight needed before anything is suggested (two clear choices). */
export const MIN_SUPPORT = 1.5;
/** Titles must be this alike (Jaccard on meaningful words). "Class X Lab" is not "Class Y Lab". */
export const MIN_SIMILARITY = 0.8;
/** One level must hold this share to be suggested alone. */
export const SINGLE_SHARE = 0.7;
/** Two adjacent levels together must hold this share, each with at least `RANGE_FLOOR`, to be suggested as a range. */
export const RANGE_SHARE = 0.85;
export const RANGE_FLOOR = 0.25;

const HALF_LIFE_DAYS = 120;
const STOP = new Set(["a", "an", "the", "to", "for", "of", "and", "or", "with", "on", "at", "in", "my", "do", "up"]);

/** The words that carry a task's meaning: lower case, no punctuation, no filler, no numbering (Lab 3 is Lab 4). */
export function meaningOf(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  return new Set(words);
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

/**
 * Suggest an Effort for `title` from `evidence`, or nothing. Sparse, stale, unlike or contradictory history
 * abstains: a wrong guess costs more than a missing one.
 */
export function suggestEffort(
  title: string,
  projectId: string | null,
  evidence: readonly EffortEvidence[],
  today: LocalDate,
): EffortSuggestion | null {
  const query = meaningOf(title);
  const matches = evidence
    .map((e) => ({ e, sim: similarity(query, meaningOf(e.title)), age: daysBetweenLocal(e.day, today) }))
    // A different list is a different context (another course, another project).
    .filter(({ e, sim, age }) => sim >= MIN_SIMILARITY && age >= 0 && age <= EVIDENCE_WINDOW_DAYS && !(projectId && e.projectId && e.projectId !== projectId))
    .sort((x, y) => y.sim - x.sim || x.age - y.age)
    .slice(0, MAX_EVIDENCE);

  const weight: Record<EffortLevel, number> = { 1: 0, 2: 0, 3: 0 };
  for (const { e, age } of matches) weight[e.level] += (e.origin === "manual" ? 1 : 0.5) * 0.5 ** (age / HALF_LIFE_DAYS);
  const total = weight[1] + weight[2] + weight[3];
  if (total < MIN_SUPPORT) return null;

  const levels: EffortLevel[] = [1, 2, 3];
  const top = levels.reduce((a, b) => (weight[b] > weight[a] ? b : a));
  if (weight[top] / total >= SINGLE_SHARE) return { kind: "level", level: top, support: matches.length };

  for (const low of [1, 2] as const) {
    const high = (low + 1) as EffortLevel;
    const pair = weight[low] + weight[high];
    if (pair / total >= RANGE_SHARE && weight[low] / total >= RANGE_FLOOR && weight[high] / total >= RANGE_FLOOR) {
      return { kind: "range", low, high, support: matches.length };
    }
  }
  return null;
}
