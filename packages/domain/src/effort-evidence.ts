import type { EffortEvidenceRow } from "@cadence/contracts/task";
import { suggestEffort, type EffortEvidence, type EffortLevel, type EffortSuggestion } from "@cadence/nlp/effort";
import { dayOf, type LocalDate, type Zone } from "./time";

export function toEvidence(rows: readonly EffortEvidenceRow[], zone: Zone): EffortEvidence[] {
    const seen = new Set<string>();
    const out: EffortEvidence[] = [];
    for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({
            title: r.title,
            projectId: r.projectId,
            level: r.effort,
            origin: r.origin,
            day: dayOf(r.chosenAt, zone),
        });
    }
    return out;
}

export interface EffortSuggestionInput {
    title: string;
    projectId: string | null;
    evidence: readonly EffortEvidence[];
    today: LocalDate;
    chosen: EffortLevel | null | undefined;
    dismissed: boolean;
    literal: boolean;
    enabled: boolean;
    supported: boolean;
}

export function projectEffortSuggestion(i: EffortSuggestionInput): EffortSuggestion | null {
    if (!i.supported || !i.enabled || i.literal || i.dismissed || i.chosen !== undefined || !i.title.trim())
        return null;
    return suggestEffort(i.title, i.projectId, i.evidence, i.today);
}

const NAMES: Record<EffortLevel, string> = { 1: "Low", 2: "Medium", 3: "High" };
export const effortName = (level: EffortLevel) => NAMES[level];

export const suggestionLabel = (s: EffortSuggestion) =>
    s.kind === "level" ? NAMES[s.level] : `${NAMES[s.low]}–${NAMES[s.high]}`;

export const suggestionLevels = (s: EffortSuggestion): EffortLevel[] =>
    s.kind === "level" ? [s.level] : [s.low, s.high];
