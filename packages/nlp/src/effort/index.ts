import { daysBetweenLocal, type LocalDate } from "../core/index.js";

export type EffortLevel = 1 | 2 | 3;

export interface EffortEvidence {
    title: string;
    projectId: string | null;
    level: EffortLevel;
    origin: "manual" | "accepted";
    day: LocalDate;
}

export type EffortSuggestion =
    | { kind: "level"; level: EffortLevel; support: number }
    | { kind: "range"; low: EffortLevel; high: EffortLevel; support: number };

export const EVIDENCE_WINDOW_DAYS = 365;
export const MAX_EVIDENCE = 12;
export const MIN_SUPPORT = 1.5;
export const MIN_SIMILARITY = 0.8;
export const SINGLE_SHARE = 0.7;
export const RANGE_SHARE = 0.85;
export const RANGE_FLOOR = 0.25;

export const HALF_LIFE_DAYS = 120;
export const STOP = new Set([
    "a",
    "an",
    "the",
    "to",
    "for",
    "of",
    "and",
    "or",
    "with",
    "on",
    "at",
    "in",
    "my",
    "do",
    "up",
]);

const MEANINGS = new Map<string, ReadonlySet<string>>();
const MEANINGS_CAP = 5_000;

export function meaningOf(title: string): ReadonlySet<string> {
    const known = MEANINGS.get(title);
    if (known) return known;
    if (MEANINGS.size >= MEANINGS_CAP) MEANINGS.clear();
    const meaning = readMeaning(title);
    MEANINGS.set(title, meaning);
    return meaning;
}

function readMeaning(title: string): Set<string> {
    const words = title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !STOP.has(w) && !/^\d{1,2}$/.test(w));
    return new Set(words);
}

export function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let both = 0;
    for (const w of a) if (b.has(w)) both++;
    return both / (a.size + b.size - both);
}

export function suggestEffort(
    title: string,
    projectId: string | null,
    evidence: readonly EffortEvidence[],
    today: LocalDate,
): EffortSuggestion | null {
    const query = meaningOf(title);
    const matches = evidence
        .map((e) => ({ e, sim: similarity(query, meaningOf(e.title)), age: daysBetweenLocal(e.day, today) }))
        .filter(
            ({ e, sim, age }) =>
                sim >= MIN_SIMILARITY &&
                age >= 0 &&
                age <= EVIDENCE_WINDOW_DAYS &&
                !(projectId && e.projectId && e.projectId !== projectId),
        )
        .sort((x, y) => y.sim - x.sim || x.age - y.age)
        .slice(0, MAX_EVIDENCE);

    if (!matches.some(({ e }) => e.origin === "manual")) return null;

    const weight: Record<EffortLevel, number> = { 1: 0, 2: 0, 3: 0 };
    for (const { e, age } of matches)
        weight[e.level] += (e.origin === "manual" ? 1 : 0.5) * 0.5 ** (age / HALF_LIFE_DAYS);
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
