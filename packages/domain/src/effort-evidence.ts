// What may inform an Effort suggestion, and when a suggestion may show. Pure; the matching itself is `@cadence/nlp/effort`.
import type { EffortEvidenceRow } from "@cadence/contracts/task";
import { suggestEffort, type EffortEvidence, type EffortLevel, type EffortSuggestion } from "@cadence/nlp/effort";
import { dayOf, type LocalDate, type Zone } from "./time";

/** The person's recorded choices as evidence: one vote per task, each on the day it was chosen in their zone. */
export function toEvidence(rows: readonly EffortEvidenceRow[], zone: Zone): EffortEvidence[] {
    const seen = new Set<string>();
    const out: EffortEvidence[] = [];
    for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ title: r.title, projectId: r.projectId, level: r.effort, origin: r.origin, day: dayOf(r.chosenAt, zone) });
    }
    return out;
}

export interface EffortSuggestionInput {
    title: string;
    projectId: string | null;
    evidence: readonly EffortEvidence[];
    today: LocalDate;
    /** The Effort the person has set on this draft: `undefined` untouched, `null` cleared by hand, or a level. Any of the last two wins. */
    chosen: EffortLevel | null | undefined;
    /** The person dismissed it for this draft. */
    dismissed: boolean;
    /** "Keep as written": no inference for this draft. */
    literal: boolean;
    /** The Effort-suggestion preference. */
    enabled: boolean;
    /** The surface stores Effort (routines and yearly events do not). */
    supported: boolean;
}

/** A suggestion to show beside the Effort control, or nothing. It never applies itself. */
export function projectEffortSuggestion(i: EffortSuggestionInput): EffortSuggestion | null {
    if (!i.supported || !i.enabled || i.literal || i.dismissed || i.chosen !== undefined || !i.title.trim()) return null;
    return suggestEffort(i.title, i.projectId, i.evidence, i.today);
}

const NAMES: Record<EffortLevel, string> = { 1: "Low", 2: "Medium", 3: "High" };
export const effortName = (level: EffortLevel) => NAMES[level];

/** "High" or "Medium–High". */
export const suggestionLabel = (s: EffortSuggestion) => (s.kind === "level" ? NAMES[s.level] : `${NAMES[s.low]}–${NAMES[s.high]}`);

/** The levels to offer: the one, or both ends of the range. */
export const suggestionLevels = (s: EffortSuggestion): EffortLevel[] => (s.kind === "level" ? [s.level] : [s.low, s.high]);
