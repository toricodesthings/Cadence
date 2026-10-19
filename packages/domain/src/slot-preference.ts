// When the person likes to do things: a stated preference first, else the bucket they keep choosing over the other
// buckets that had room. It only ORDERS Find-a-time proposals; it never moves, shortens or decides anything.
import type { TimeOfDay } from "@cadence/contracts/planning";
import { meaningOf, similarity } from "@cadence/nlp/effort";
import { daysBetween, type LocalDate } from "./time";

/** One real choice (a manual drop, or a pick after comparing proposals): where it landed, and what else had room. */
export interface SlotRecord {
    chosen: TimeOfDay;
    /** Every bucket that had room that day, including the chosen one. */
    feasible: TimeOfDay[];
    /** Cadence proposed it (counts half): a first proposal is a default, not a vote. */
    suggested: boolean;
    saidOn: LocalDate;
    projectId: string | null;
}

/** "I study after dinner": said in chat, applies at once. `about` null = everything. */
export interface StatedWhen {
    buckets: TimeOfDay[];
    about: string | null;
}

const HALF_LIFE_DAYS = 90;
const MIN_RECORDS = 8;
const MIN_DAYS = 4;
const MIN_WEIGHT = 4;
const WIN_SHARE = 0.65;
/** Of the latest 5 records where the winner had room, this many chose otherwise → the winner is off. */
const DRIFT_WINDOW = 5;
const DRIFT_CONTRADICTIONS = 3;

const weightOf = (r: SlotRecord, today: LocalDate) => (r.suggested ? 0.5 : 1) * 2 ** (-Math.max(0, daysBetween(r.saidOn, today)) / HALF_LIFE_DAYS);

function qualified(records: readonly SlotRecord[], today: LocalDate): boolean {
    return records.length >= MIN_RECORDS && new Set(records.map((r) => r.saidOn)).size >= MIN_DAYS && records.reduce((sum, r) => sum + weightOf(r, today), 0) >= MIN_WEIGHT;
}

/** Winner's decayed win share against `other`, or null with no comparison between them. */
function shareAgainst(records: readonly SlotRecord[], winner: TimeOfDay, other: TimeOfDay, today: LocalDate): number | null {
    let won = 0;
    let lost = 0;
    for (const r of records) {
        if (!r.feasible.includes(winner) || !r.feasible.includes(other) || (r.chosen !== winner && r.chosen !== other)) continue;
        // One choice weighs at most 1 in total: its weight is split across the buckets it beat.
        const share = weightOf(r, today) / Math.max(1, new Set(r.feasible).size - 1);
        if (r.chosen === winner) won += share;
        else lost += share;
    }
    return won + lost === 0 ? null : won / (won + lost);
}

/** Chronological records where `winner` had room: has the person started choosing otherwise? Off until 5 more records after the third such choice. */
function drifted(records: readonly SlotRecord[], winner: TimeOfDay): boolean {
    const chronological = [...records].sort((a, b) => a.saidOn.localeCompare(b.saidOn));
    let window: boolean[] = [];
    let offUntil = 0;
    chronological.forEach((r, i) => {
        if (!r.feasible.includes(winner)) return;
        window = [...window, r.chosen !== winner].slice(-DRIFT_WINDOW);
        if (window.filter(Boolean).length >= DRIFT_CONTRADICTIONS && i >= offUntil) {
            offUntil = i + DRIFT_WINDOW + 1;
            window = [];
        }
    });
    return chronological.length < offUntil;
}

/**
 * The bucket this person keeps choosing for this kind of thing, or `[]`. The task's list first (if it has enough
 * choices), else all of them. The winner must win ≥ 65% of its comparisons against every other bucket that has room
 * today, each compared at least once. No winner, a cycle, drift or too few choices → nothing is claimed.
 */
export function learnedPreference(records: readonly SlotRecord[], opts: { projectId: string | null; feasibleToday: readonly TimeOfDay[]; today: LocalDate }): TimeOfDay[] {
    const { feasibleToday, today } = opts;
    if (new Set(feasibleToday).size < 2) return [];
    const inList = opts.projectId ? records.filter((r) => r.projectId === opts.projectId) : [];
    const pool = qualified(inList, today) ? inList : records;
    if (!qualified(pool, today)) return [];
    const winner = [...new Set(feasibleToday)].find((candidate) =>
        [...new Set(feasibleToday)].every((other) => {
            if (other === candidate) return true;
            const share = shareAgainst(pool, candidate, other, today);
            return share !== null && share >= WIN_SHARE;
        }),
    );
    return winner && !drifted(pool, winner) ? [winner] : [];
}

/** A stated preference that applies to this task: it says nothing about a topic, or the topic shares a meaningful word with the title or is the list's name. The newest applying one wins. */
export function statedPreference(stated: readonly StatedWhen[], task: { title: string; listName: string | null }): TimeOfDay[] {
    const title = meaningOf(task.title);
    const list = task.listName?.trim().toLowerCase();
    const applies = (s: StatedWhen) => s.buckets.length > 0 && (!s.about || similarity(meaningOf(s.about), title) > 0 || (!!list && s.about.trim().toLowerCase() === list));
    return stated.find(applies)?.buckets ?? [];
}

/** Stated first, then learned. `stated` is newest first. */
export function preferredBuckets(
    evidence: { records: readonly SlotRecord[]; stated: readonly StatedWhen[] },
    task: { title: string; projectId: string | null; listName: string | null },
    feasibleToday: readonly TimeOfDay[],
    today: LocalDate,
): TimeOfDay[] {
    const stated = statedPreference(evidence.stated, task);
    return stated.length ? stated : learnedPreference(evidence.records, { projectId: task.projectId, feasibleToday, today });
}
